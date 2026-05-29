// Regenerate palette.csv from authoritative Minecraft base map colors.
// Source: https://minecraft.wiki/w/Map_item_format#Base_colors
//
// For each base color with RGB (r,g,b), the four map shades are:
//   Color0: r * 255/255 = r   brightest (MC byte 2), reached by 1 bone meal click
//   Color1: r * 220/255       the placed base color (MC byte 1), 0 clicks
//   Color2: r * 180/255       1 coal click darker (MC byte 0)
//   Color3: r * 135/255       darkest (MC byte 3), 2 coal clicks darker
// Color1 is what you get just by placing the material. Bone meal brightens it
// one step to Color0; coal darkens it one step to Color2, twice to Color3.
// Integer division (floor), matching the wiki's "finally rounding down".
//
// CSV layout (brightest to darkest): Item,Color0,Color1,Color2,Color3

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// (item label, baseColorId per Mojang MapColor table, base RGB).
// baseColorId is what the Minecraft map item byte stores: each pixel is
// (baseColorId * 4) + shadeOffset. The shadeOffset is determined from the
// CSV column (Color0..Color3 -> 2, 1, 0, 3) per the wiki shade table.
// The 61 entries here mirror ArtMap's Palette_1_18 subset.
const entries = [
  ["Grass", 1, 127, 178, 56],
  ["Pumpkin Seeds", 2, 247, 233, 163], // SAND
  ["Cobweb", 3, 199, 199, 199], // WOOL
  ["Red Dye", 4, 255, 0, 0], // FIRE
  ["Ice", 5, 160, 160, 255], // ICE
  ["Light Gray Dye", 6, 167, 167, 167], // METAL
  ["Oak Leaves", 7, 0, 124, 0], // PLANT
  ["Snow", 8, 255, 255, 255], // SNOW
  ["Gray Dye", 9, 164, 168, 184], // CLAY
  ["Melon Seeds", 10, 151, 109, 77], // DIRT
  ["Ghast Tear", 11, 112, 112, 112], // STONE
  ["Block of Lapis Lazuli", 12, 64, 64, 255], // WATER
  ["Dark Oak Log", 13, 143, 119, 72], // WOOD
  ["Bone Meal", 14, 255, 252, 245], // QUARTZ
  ["Orange Dye", 15, 216, 127, 51],
  ["Magenta Dye", 16, 178, 76, 216],
  ["Light Blue Dye", 17, 102, 153, 216],
  ["Yellow Dye", 18, 229, 229, 51],
  ["Lime Dye", 19, 127, 204, 25],
  ["Pink Dye", 20, 242, 127, 165],
  ["Flint", 21, 76, 76, 76], // GRAY
  ["Gunpowder", 22, 153, 153, 153], // LIGHT_GRAY
  ["Cyan Dye", 23, 76, 127, 153],
  ["Purple Dye", 24, 127, 63, 178],
  ["Lapis Lazuli", 25, 51, 76, 178], // BLUE
  ["Cocoa Beans", 26, 102, 76, 51], // BROWN
  ["Green Dye", 27, 102, 127, 51],
  ["Brick", 28, 153, 51, 51], // RED
  ["Ink Sac", 29, 25, 25, 25], // BLACK
  ["Gold Nugget", 30, 250, 238, 77],
  ["Prismarine Crystals", 31, 92, 219, 213], // DIAMOND
  ["Lapis Lazuli Ore", 32, 74, 128, 255], // LAPIS
  ["Emerald", 33, 0, 217, 58],
  ["Podzol", 34, 129, 86, 49],
  ["Nether Wart", 35, 112, 2, 0], // NETHER
  ["Egg", 36, 209, 177, 161], // TERRACOTTA_WHITE
  ["Magma Cream", 37, 159, 82, 36], // TERRACOTTA_ORANGE
  ["Beetroot", 38, 149, 87, 108], // TERRACOTTA_MAGENTA
  ["Mycelium", 39, 112, 108, 138], // TERRACOTTA_LIGHT_BLUE
  ["Glowstone Dust", 40, 186, 133, 36], // TERRACOTTA_YELLOW
  ["Slimeball", 41, 103, 117, 53], // TERRACOTTA_LIGHT_GREEN
  ["Spider Eye", 42, 160, 77, 78], // TERRACOTTA_PINK
  ["Soul Sand", 43, 57, 41, 35], // TERRACOTTA_GRAY
  ["Brown Mushroom", 44, 135, 107, 98], // TERRACOTTA_LIGHT_GRAY
  ["Iron Nugget", 45, 87, 92, 92], // TERRACOTTA_CYAN
  ["Chorus Fruit", 46, 122, 73, 88], // TERRACOTTA_PURPLE
  ["Purpur Block", 47, 76, 62, 92], // TERRACOTTA_BLUE
  ["Birch Wood", 48, 76, 50, 35], // TERRACOTTA_BROWN
  ["Poisonous Potato", 49, 76, 82, 42], // TERRACOTTA_GREEN
  ["Apple", 50, 142, 60, 46], // TERRACOTTA_RED
  ["Charcoal", 51, 37, 22, 16], // TERRACOTTA_BLACK
  ["Crimson Nylium", 52, 189, 48, 49],
  ["Crimson Stem", 53, 148, 63, 97],
  ["Crimson Hyphae", 54, 92, 25, 29],
  ["Warped Nylium", 55, 22, 126, 134],
  ["Warped Stem", 56, 58, 142, 140],
  ["Warped Hyphae", 57, 86, 44, 62],
  ["Warped Wart Block", 58, 20, 180, 133],
  ["Cobbled Deepslate", 59, 100, 100, 100], // DEEPSLATE
  ["Raw Iron", 60, 216, 175, 147],
  ["Glow Lichen", 61, 127, 167, 150],
];

const SHADES = [
  { label: "Color0", mul: 255 }, // brightest, 1 bone meal click up from base
  { label: "Color1", mul: 220 }, // the placed base color, 0 clicks
  { label: "Color2", mul: 180 }, // 1 coal click down from base
  { label: "Color3", mul: 135 }, // darkest, 2 coal clicks down from base
];

function hex(n) {
  return n.toString(16).padStart(2, "0");
}

function shadeHex(r, g, b, mul) {
  const R = Math.floor((r * mul) / 255);
  const G = Math.floor((g * mul) / 255);
  const B = Math.floor((b * mul) / 255);
  return `#${hex(R)}${hex(G)}${hex(B)}`;
}

const header = ["Item", "BaseId", ...SHADES.map((s) => s.label)].join(",");
const rows = entries.map(([name, baseId, r, g, b]) => {
  const cells = SHADES.map((s) => shadeHex(r, g, b, s.mul));
  return [name, baseId, ...cells].join(",");
});

const csv = [header, ...rows].join("\n") + "\n";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "..", "core", "palette.csv");
const tsOutPath = resolve(here, "..", "core", "src", "palette-data.ts");

const dryRun = process.argv.includes("--check");

if (existsSync(outPath)) {
  // Compare item-by-item, ignoring row ordering.
  const parse = (text) => {
    const rows = text.replace(/\r\n/g, "\n").trim().split("\n");
    const [head, ...body] = rows;
    const map = new Map();
    for (const r of body) {
      const [name, ...cells] = r.split(",");
      map.set(name, cells.join(","));
    }
    return { head, map };
  };
  const cur = parse(readFileSync(outPath, "utf8"));
  const gen = parse(csv);

  const diffs = [];
  const missingInCurrent = [];
  const extraInCurrent = [];
  for (const [name, want] of gen.map) {
    if (!cur.map.has(name)) {
      missingInCurrent.push(name);
    } else if (cur.map.get(name) !== want) {
      diffs.push({ name, have: cur.map.get(name), want });
    }
  }
  for (const name of cur.map.keys()) {
    if (!gen.map.has(name)) extraInCurrent.push(name);
  }

  if (cur.head !== gen.head) {
    console.log(`Header differs:`);
    console.log(`  have: ${cur.head}`);
    console.log(`  want: ${gen.head}`);
  }
  if (
    diffs.length === 0 &&
    missingInCurrent.length === 0 &&
    extraInCurrent.length === 0
  ) {
    console.log(
      "palette.csv values match the wiki table exactly (ignoring row order).",
    );
  } else {
    if (diffs.length) {
      console.log(`Value mismatches (${diffs.length}):`);
      for (const d of diffs) {
        console.log(`  ${d.name}`);
        console.log(`    have: ${d.have}`);
        console.log(`    want: ${d.want}`);
      }
    }
    if (missingInCurrent.length)
      console.log(
        `Missing from current (${missingInCurrent.length}): ${missingInCurrent.join(", ")}`,
      );
    if (extraInCurrent.length)
      console.log(
        `Extra in current (${extraInCurrent.length}): ${extraInCurrent.join(", ")}`,
      );
  }
}

if (!dryRun) {
  writeFileSync(outPath, csv, "utf8");
  console.log(`Wrote ${entries.length} items to ${outPath}`);

  // Also emit a TS module so consumers (CLI, web) can import the palette
  // as a string without a runtime file read. Keeps web from needing a
  // duplicate copy in public/.
  const banner =
    "// Auto-generated by scripts/gen-palette.mjs. Do not edit by hand.\n" +
    "// Regenerate with: node scripts/gen-palette.mjs\n\n";
  const ts = `${banner}export const BUILTIN_PALETTE_CSV = ${JSON.stringify(csv)};\n`;
  writeFileSync(tsOutPath, ts, "utf8");
  console.log(`Wrote bundled palette to ${tsOutPath}`);
}
