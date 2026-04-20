#!/usr/bin/env node
/**
 * Downloads Minecraft item/block textures from InventivetalentDev/minecraft-assets
 * (a mirror of Mojang assets) for every entry in palette.csv.
 *
 * Output: ./items/<normalized_name>.png
 *   where <normalized_name> matches the palette CSV "Item" column, lowercased,
 *   with whitespace replaced by underscores.
 *
 * Usage:
 *   node scripts/fetch-textures.mjs
 *   node scripts/fetch-textures.mjs --version 1.20.4
 *   node scripts/fetch-textures.mjs --palette palette.csv --out items
 *
 * Requires Node.js >= 20 (uses global fetch).
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import process from "node:process";

// Map palette item name -> [folder, filename] in minecraft assets.
// folder is 'item' or 'block'. Filename is without .png.
// Some entries are animated / have multiple frames; we pick a sensible single-frame texture.
const TEXTURE_MAP = {
  raw_iron: ["item", "raw_iron"],
  egg: ["item", "egg"],
  pink_dye: ["item", "pink_dye"],
  crimson_stem: ["block", "crimson_stem"],
  beetroot: ["item", "beetroot"],
  chorus_fruit: ["item", "chorus_fruit"],
  warped_hyphae: ["block", "warped_stem"], // hyphae uses stem texture
  ice: ["block", "ice"],
  magenta_dye: ["item", "magenta_dye"],
  purple_dye: ["item", "purple_dye"],
  purpur_block: ["block", "purpur_block"],
  mycelium: ["block", "mycelium_top"],
  lapis_lazuli: ["item", "lapis_lazuli"],
  block_of_lapis_lazuli: ["block", "lapis_block"],
  lapis_lazuli_ore: ["block", "lapis_ore"],
  light_blue_dye: ["item", "light_blue_dye"],
  cyan_dye: ["item", "cyan_dye"],
  prismarine_crystals: ["item", "prismarine_crystals"],
  warped_stem: ["block", "warped_stem"],
  warped_nylium: ["block", "warped_nylium"],
  warped_wart_block: ["block", "warped_wart_block"],
  lime_dye: ["item", "lime_dye"],
  grass: ["block", "grass_block_top"],
  glow_lichen: ["block", "glow_lichen"],
  slimeball: ["item", "slime_ball"],
  green_dye: ["item", "green_dye"],
  poisonous_potato: ["item", "poisonous_potato"],
  emerald: ["item", "emerald"],
  oak_leaves: ["block", "oak_leaves"],
  pumpkin_seeds: ["item", "pumpkin_seeds"],
  gold_nugget: ["item", "gold_nugget"],
  yellow_dye: ["item", "yellow_dye"],
  glowstone_dust: ["item", "glowstone_dust"],
  orange_dye: ["item", "orange_dye"],
  magma_cream: ["item", "magma_cream"],
  dark_oak_log: ["block", "dark_oak_log"],
  melon_seeds: ["item", "melon_seeds"],
  birch_wood: ["block", "birch_log"],
  cocoa_beans: ["item", "cocoa_beans"],
  podzol: ["block", "podzol_top"],
  soul_sand: ["block", "soul_sand"],
  charcoal: ["item", "charcoal"],
  apple: ["item", "apple"],
  spider_eye: ["item", "spider_eye"],
  crimson_nylium: ["block", "crimson_nylium"],
  brick: ["item", "brick"],
  crimson_hyphae: ["block", "crimson_stem"], // hyphae uses stem texture
  red_dye: ["item", "red_dye"],
  nether_wart: ["item", "nether_wart"],
  snow: ["block", "snow"],
  bone_meal: ["item", "bone_meal"],
  cobweb: ["block", "cobweb"],
  light_gray_dye: ["item", "light_gray_dye"],
  gray_dye: ["item", "gray_dye"],
  gunpowder: ["item", "gunpowder"],
  brown_mushroom: ["block", "brown_mushroom"],
  ghast_tear: ["item", "ghast_tear"],
  cobbled_deepslate: ["block", "cobbled_deepslate"],
  iron_nugget: ["item", "iron_nugget"],
  flint: ["item", "flint"],
  ink_sac: ["item", "ink_sac"],
};

/** Minimal CLI flag parser for --key value / --key=value. No external deps. */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else {
        out[a.slice(2)] = true;
      }
    }
  }
  return out;
}

/** Tiny CSV row parser. Handles quoted fields and escaped quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore, '\n' will terminate the row
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // final field / row if file doesn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeItemName(raw) {
  return raw.toLowerCase().replace(/\s+/g, "_");
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// ANSI colors, skipped if stdout is not a TTY (e.g. in CI logs).
const useColor = process.stdout.isTTY === true;
const color = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => color("32", s);
const gray = (s) => color("90", s);
const cyan = (s) => color("36", s);
const yellow = (s) => color("33", s);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = args.version ?? "1.20.4";
  const paletteCsv = args.palette ?? "palette.csv";
  const outDir = args.out ?? "items";

  if (!(await exists(paletteCsv))) {
    console.error(`Palette CSV not found: ${paletteCsv}`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  const csvText = await readFile(paletteCsv, "utf8");
  const rows = parseCsv(csvText).filter(
    (r) => r.length > 0 && r.some((c) => c.length > 0),
  );
  if (rows.length === 0) {
    console.error(`Palette CSV is empty: ${paletteCsv}`);
    process.exit(1);
  }

  // First row is the header. Find the "Item" column (case-insensitive).
  const header = rows[0].map((h) => h.trim());
  const itemIdx = header.findIndex((h) => h.toLowerCase() === "item");
  if (itemIdx === -1) {
    console.error(
      `Palette CSV is missing an "Item" column. Header was: ${header.join(", ")}`,
    );
    process.exit(1);
  }

  const items = rows
    .slice(1)
    .map((r) => (r[itemIdx] ?? "").trim())
    .filter((v) => v.length > 0)
    .map(normalizeItemName);

  const baseUrl = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${version}/assets/minecraft/textures`;

  let ok = 0;
  let fail = 0;
  let skipped = 0;

  for (const name of items) {
    const outPath = join(outDir, `${name}.png`);

    if (await exists(outPath)) {
      console.log(gray(`[skip] ${name} (exists)`));
      skipped++;
      continue;
    }

    const mapping = TEXTURE_MAP[name];
    if (!mapping) {
      console.warn(
        yellow(`[warn] no texture mapping for '${name}', skipping.`),
      );
      fail++;
      continue;
    }

    const [folder, file] = mapping;
    const url = `${baseUrl}/${folder}/${file}.png`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(outPath, buf);
      console.log(green(`[ok]   ${name} <- ${folder}/${file}.png`));
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(yellow(`[fail] ${name} from ${url} : ${msg}`));
      fail++;
    }
  }

  console.log("");
  console.log(
    cyan(`Done. ok=${ok} fail=${fail} skipped=${skipped}  -> ${outDir}/`),
  );

  // Non-zero exit if everything failed, so CI / callers can detect it.
  if (ok === 0 && fail > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
