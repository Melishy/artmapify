// Regenerate palette.csv from authoritative Minecraft base map colors.
// Source: https://minecraft.wiki/w/Map_item_format#Base_colors
//
// For each base color with RGB (r,g,b), the four map shades are (by click
// count, the number of darken clicks from the base material):
//   click 0: r * 255/255 = r        brightest (as placed, MC byte 2)
//   click 1: r * 220/255            second brightest (MC byte 1)
//   click 2: r * 180/255            second darkest (MC byte 0)
//   click 3: r * 135/255            darkest (MC byte 3)
// Integer division (floor), matching the wiki's "finally rounding down".
//
// CSV layout (brightest to darkest): Item,Color0,Color1,Color2,Color3

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// (item label used in CSV, base RGB from wiki)
// Subset of MC base colors that correspond to a reasonable obtainable flat-map
// item (matches ArtMap's Palette_1_18 set, 61 entries).
const entries = [
  ["Grass", 127, 178, 56], // 1
  ["Pumpkin Seeds", 247, 233, 163], // 2 SAND
  ["Cobweb", 199, 199, 199], // 3 WOOL
  ["Red Dye", 255, 0, 0], // 4 FIRE
  ["Ice", 160, 160, 255], // 5 ICE
  ["Light Gray Dye", 167, 167, 167], // 6 METAL
  ["Oak Leaves", 0, 124, 0], // 7 PLANT
  ["Snow", 255, 255, 255], // 8 SNOW
  ["Gray Dye", 164, 168, 184], // 9 CLAY
  ["Melon Seeds", 151, 109, 77], // 10 DIRT
  ["Ghast Tear", 112, 112, 112], // 11 STONE
  ["Block of Lapis Lazuli", 64, 64, 255], // 12 WATER
  ["Dark Oak Log", 143, 119, 72], // 13 WOOD
  ["Bone Meal", 255, 252, 245], // 14 QUARTZ
  ["Orange Dye", 216, 127, 51], // 15
  ["Magenta Dye", 178, 76, 216], // 16
  ["Light Blue Dye", 102, 153, 216], // 17
  ["Yellow Dye", 229, 229, 51], // 18
  ["Lime Dye", 127, 204, 25], // 19
  ["Pink Dye", 242, 127, 165], // 20
  ["Flint", 76, 76, 76], // 21 GRAY
  ["Gunpowder", 153, 153, 153], // 22 LIGHT_GRAY
  ["Cyan Dye", 76, 127, 153], // 23
  ["Purple Dye", 127, 63, 178], // 24
  ["Lapis Lazuli", 51, 76, 178], // 25 BLUE
  ["Cocoa Beans", 102, 76, 51], // 26 BROWN
  ["Green Dye", 102, 127, 51], // 27
  ["Brick", 153, 51, 51], // 28 RED
  ["Ink Sac", 25, 25, 25], // 29 BLACK
  ["Gold Nugget", 250, 238, 77], // 30
  ["Prismarine Crystals", 92, 219, 213], // 31 DIAMOND
  ["Lapis Lazuli Ore", 74, 128, 255], // 32 LAPIS
  ["Emerald", 0, 217, 58], // 33
  ["Podzol", 129, 86, 49], // 34
  ["Nether Wart", 112, 2, 0], // 35 NETHER
  ["Egg", 209, 177, 161], // 36 TERRACOTTA_WHITE
  ["Magma Cream", 159, 82, 36], // 37 TERRACOTTA_ORANGE
  ["Beetroot", 149, 87, 108], // 38 TERRACOTTA_MAGENTA
  ["Mycelium", 112, 108, 138], // 39 TERRACOTTA_LIGHT_BLUE
  ["Glowstone Dust", 186, 133, 36], // 40 TERRACOTTA_YELLOW
  ["Slimeball", 103, 117, 53], // 41 TERRACOTTA_LIGHT_GREEN
  ["Spider Eye", 160, 77, 78], // 42 TERRACOTTA_PINK
  ["Soul Sand", 57, 41, 35], // 43 TERRACOTTA_GRAY
  ["Brown Mushroom", 135, 107, 98], // 44 TERRACOTTA_LIGHT_GRAY
  ["Iron Nugget", 87, 92, 92], // 45 TERRACOTTA_CYAN
  ["Chorus Fruit", 122, 73, 88], // 46 TERRACOTTA_PURPLE
  ["Purpur Block", 76, 62, 92], // 47 TERRACOTTA_BLUE
  ["Birch Wood", 76, 50, 35], // 48 TERRACOTTA_BROWN
  ["Poisonous Potato", 76, 82, 42], // 49 TERRACOTTA_GREEN
  ["Apple", 142, 60, 46], // 50 TERRACOTTA_RED
  ["Charcoal", 37, 22, 16], // 51 TERRACOTTA_BLACK
  ["Crimson Nylium", 189, 48, 49], // 52
  ["Crimson Stem", 148, 63, 97], // 53
  ["Crimson Hyphae", 92, 25, 29], // 54
  ["Warped Nylium", 22, 126, 134], // 55
  ["Warped Stem", 58, 142, 140], // 56
  ["Warped Hyphae", 86, 44, 62], // 57
  ["Warped Wart Block", 20, 180, 133], // 58
  ["Cobbled Deepslate", 100, 100, 100], // 59 DEEPSLATE
  ["Raw Iron", 216, 175, 147], // 60
  ["Glow Lichen", 127, 167, 150], // 61
];

const SHADES = [
  { label: "Color0", mul: 255 }, // 0 clicks = brightest (base)
  { label: "Color1", mul: 220 }, // 1 click
  { label: "Color2", mul: 180 }, // 2 clicks
  { label: "Color3", mul: 135 }, // 3 clicks = darkest
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

const header = ["Item", ...SHADES.map((s) => s.label)].join(",");
const rows = entries.map(([name, r, g, b]) => {
  const cells = SHADES.map((s) => shadeHex(r, g, b, s.mul));
  return [name, ...cells].join(",");
});

const csv = [header, ...rows].join("\n") + "\n";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "..", "palette.csv");

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
}
