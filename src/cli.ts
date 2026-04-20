#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";
import { loadPalette, type ColorMetric } from "./palette.js";
import {
  prepareImage,
  quantize,
  splitIntoTiles,
  DEFAULT_ADJUSTMENTS,
  type Adjustments,
  type DitherMethod,
  type FitMode,
} from "./image.js";
import {
  renderCanvasImage,
  renderPreviewImage,
  renderTileImage,
} from "./render.js";

interface Args {
  input: string;
  outDir: string;
  palette: string;
  itemsDir: string;
  gridW: number;
  gridH: number;
  tileSize: number;
  cellSize: number;
  previewScale: number;
  texturePadding: number;
  tileBorder: number;
  cellBorder: number;
  rulerMargin: number;
  dither: DitherMethod;
  metric: ColorMetric;
  clickBias: number;
  gammaDither: boolean;
  fit: FitMode;
  /** If true, auto-derive gridW/gridH from the input image aspect ratio. */
  aspectAuto: boolean;
  adjustments: Adjustments;
  guide: boolean;
  combined: boolean;
  summary: boolean;
}

/** Parse a required int arg; throw a clear error on NaN / bad input. */
function parseIntArg(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`--${name} expects an integer, got '${raw}'`);
  }
  return n;
}

/** Parse a required float arg; throw a clear error on NaN / bad input. */
function parseFloatArg(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`--${name} expects a number, got '${raw}'`);
  }
  return n;
}

/** Read the argv truthy-value for a boolean flag (supports --flag or --flag true/false). */
function parseBoolArg(
  name: string,
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined) return fallback;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  throw new Error(`--${name} expects true/false, got '${raw}'`);
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  const positional: string[] = [];
  // Flags that never take a value, so we don't accidentally eat the next token.
  const flagOnly = new Set(["help", "h", "guide", "combined", "gamma-dither"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      args.help = "true";
      continue;
    }
    if (a.startsWith("--")) {
      let key = a.slice(2);
      let value: string | undefined;
      const eq = key.indexOf("=");
      if (eq >= 0) {
        value = key.slice(eq + 1);
        key = key.slice(0, eq);
      }
      if (value === undefined) {
        if (flagOnly.has(key)) {
          value = "true";
        } else {
          const next = argv[i + 1];
          if (next !== undefined && !next.startsWith("--")) {
            value = next;
            i++;
          } else {
            value = "true";
          }
        }
      }
      args[key] = value;
    } else {
      positional.push(a);
    }
  }

  if (args.help === "true") {
    printUsage();
    process.exit(0);
  }

  const input = args.input ?? positional[0];
  if (!input) {
    printUsage();
    process.exit(1);
  }

  const dither = (args.dither ?? "none").toLowerCase() as DitherMethod;
  if (!["none", "floyd-steinberg", "burkes", "sierra-lite"].includes(dither)) {
    throw new Error(
      `Invalid --dither '${dither}'. Expected: none | floyd-steinberg | burkes | sierra-lite`,
    );
  }

  const metric = (args.metric ?? "luma-hue").toLowerCase() as ColorMetric;
  if (!["luma-hue", "redmean", "rgb"].includes(metric)) {
    throw new Error(
      `Invalid --metric '${metric}'. Expected: luma-hue | redmean | rgb`,
    );
  }

  const filter = (args.filter ?? "none").toLowerCase();
  if (!["none", "grayscale", "sepia"].includes(filter)) {
    throw new Error(
      `Invalid --filter '${filter}'. Expected: none | grayscale | sepia`,
    );
  }

  const fit = (args.fit ?? "fill").toLowerCase() as FitMode;
  if (!["contain", "cover", "fill"].includes(fit)) {
    throw new Error(`Invalid --fit '${fit}'. Expected: contain | cover | fill`);
  }

  const aspectRaw = args.aspect;
  let aspectAuto = false;
  if (aspectRaw !== undefined) {
    if (aspectRaw === "auto") aspectAuto = true;
    else if (aspectRaw !== "manual") {
      throw new Error(
        `Invalid --aspect '${aspectRaw}'. Expected: auto | manual`,
      );
    }
  }

  return {
    input: resolve(input),
    outDir: resolve(args.out ?? "out"),
    palette: resolve(args.palette ?? "palette.csv"),
    itemsDir: resolve(args.items ?? "items"),
    gridW: parseIntArg("width", args.width, 4),
    gridH: parseIntArg("height", args.height, 4),
    tileSize: parseIntArg("tile-size", args["tile-size"], 32),
    cellSize: parseIntArg("cell-size", args["cell-size"], 32),
    previewScale: parseIntArg("preview-scale", args["preview-scale"], 4),
    texturePadding: parseFloatArg(
      "texture-padding",
      args["texture-padding"],
      0.2,
    ),
    tileBorder: parseIntArg("tile-border", args["tile-border"], 2),
    cellBorder: parseIntArg("cell-border", args["cell-border"], 1),
    rulerMargin: parseIntArg("ruler-margin", args["ruler-margin"], 24),
    dither,
    metric,
    clickBias: parseFloatArg("click-bias", args["click-bias"], 0),
    gammaDither: parseBoolArg("gamma-dither", args["gamma-dither"], false),
    fit,
    aspectAuto,
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      brightness: parseFloatArg("brightness", args.brightness, 1),
      contrast: parseFloatArg("contrast", args.contrast, 1),
      saturation: parseFloatArg("saturation", args.saturation, 1),
      sharpness: parseFloatArg("sharpness", args.sharpness, 1),
      filter: filter as Adjustments["filter"],
    },
    guide: args.guide === "true",
    combined: args.combined === "true",
    summary: args.summary !== "false",
  };
}

function printUsage(): void {
  console.log(`ArtMapify - convert an image to Minecraft ArtMap dye grids.

Usage:
  artmapify <input.png> [options]

Options:
  -h, --help           Show this help and exit.
  --out <dir>          Output directory (default: out)
  --palette <csv>      Palette CSV (default: palette.csv)
  --items <dir>        Item textures folder (default: items)
  --width <n>          Canvas width in tiles (default: 4)
  --height <n>         Canvas height in tiles (default: 4)
  --aspect <mode>      'auto' derives --width / --height from the input
                       image aspect ratio while keeping the same tile
                       budget (width*height). 'manual' (default) uses the
                       --width / --height values verbatim.
  --fit <mode>         How to resize the input onto the canvas:
                         fill    stretch to exact canvas (default)
                         cover   fill canvas, crop overflow (no distortion)
                         contain fit inside canvas, letterbox bars
  --tile-size <n>      Dye cells per tile side (default: 32)
  --cell-size <n>      Guide-image pixels per dye cell (default: 32)
  --preview-scale <n>  Nearest-neighbor zoom for preview.png (default: 4)
  --texture-padding <f> Fraction of cell used as colored border around the
                       texture in guide images. 0 = texture fills cell,
                       0.2 = 20% border (default), 0.45 = tiny texture.
  --tile-border <n>    Black grid line width (px) between tiles on canvas.png.
                       0 disables, default 2.
  --cell-border <n>    Black grid line width (px) between cells in per-tile
                       map_*.png guides. 0 disables, default 1.
  --ruler-margin <n>   Width (px) of the coordinate ruler around each
                       map_*.png (column numbers on top, row numbers on
                       left). 0 disables, default 24.
  --dither <method>    none | floyd-steinberg | burkes | sierra-lite
  --gamma-dither       Diffuse dither error in linear-light space. Usually
                       cleaner gradients on photos; slight speed cost.
  --metric <name>      Color-match metric (default: luma-hue)
                       luma-hue: grays stay gray, saturated match hue
                       redmean:  cheap perceptual, keeps dark tinted colors
                       rgb:      plain squared RGB distance
  --click-bias <f>     Penalize shades that cost more in-game clicks per
                       cell (default 0 = pure color match). Shade 1 is 0
                       clicks (placed), 0 and 2 are 1 click (feather /
                       coal once), 3 is 2 clicks (coal twice). Try 8..16
                       to save real-world effort on near-ties.
  --brightness <f>     Default 1.0
  --contrast <f>       Default 1.0
  --saturation <f>     Default 1.0
  --sharpness <f>      Default 1.0
  --filter <name>      none | grayscale | sepia
  --guide              Also emit per-tile guide images (textures + shade #)
  --combined           With --guide, also stitch all tiles into canvas.png
  --summary false      Skip writing summary.json

Outputs (in --out dir):
  preview.png          What the art will look like in-game (compare to source).
  map_<gx>_<gy>.png    (--guide) Per-tile guide with item textures and shades.
  canvas.png           (--guide --combined) All guide tiles stitched.
  summary.json         Dye counts per tile and totals, plus an inputHash
                       + argsHash for staleness detection.
`);
}

/**
 * If --aspect auto, rescale the requested gridW/gridH to match the input's
 * aspect ratio while keeping the same total tile budget (gridW * gridH).
 * Leaves args untouched if not auto.
 */
async function applyAspectAuto(args: Args): Promise<void> {
  if (!args.aspectAuto) return;
  const meta = await sharp(args.input).metadata();
  const iw = meta.width;
  const ih = meta.height;
  if (!iw || !ih) {
    console.warn(
      "--aspect auto: could not read image dimensions, keeping --width/--height.",
    );
    return;
  }
  const budget = Math.max(1, args.gridW * args.gridH);
  const aspect = iw / ih;
  // gridW * gridH = budget, gridW / gridH = aspect
  // => gridH = sqrt(budget / aspect), gridW = aspect * gridH
  let gh = Math.sqrt(budget / aspect);
  let gw = aspect * gh;
  gw = Math.max(1, Math.round(gw));
  gh = Math.max(1, Math.round(gh));
  console.log(
    `--aspect auto: input ${iw}x${ih} (${aspect.toFixed(3)}:1), ` +
      `tiles ${args.gridW}x${args.gridH} -> ${gw}x${gh} (budget ${budget}).`,
  );
  args.gridW = gw;
  args.gridH = gh;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  await applyAspectAuto(args);

  const palette = loadPalette(args.palette);
  console.log(`Loaded palette: ${palette.entries.length} colors.`);

  const prepared = await prepareImage(
    args.input,
    args.gridW,
    args.gridH,
    args.tileSize,
    args.adjustments,
    args.dither,
    args.fit,
  );
  console.log(
    `Prepared ${prepared.width}x${prepared.height} px image (fit=${args.fit}).`,
  );

  const grid = quantize(
    prepared,
    palette,
    args.dither,
    args.metric,
    args.clickBias,
    args.gammaDither,
  );
  const tiles = splitIntoTiles(
    grid,
    prepared.width,
    args.gridW,
    args.gridH,
    args.tileSize,
  );
  console.log(
    `Quantized -> ${tiles.length} tiles (${args.tileSize}x${args.tileSize} each).`,
  );

  await mkdir(args.outDir, { recursive: true });

  // Preview image: flat dye pixels, upscaled nearest-neighbor. This is the
  // one to compare visually to the input.
  const previewBuf = await renderPreviewImage(
    tiles,
    args.gridW,
    args.gridH,
    args.tileSize,
    args.previewScale,
  );
  await writeFile(join(args.outDir, "preview.png"), previewBuf);
  console.log("  wrote preview.png");

  if (args.guide) {
    // Warn about any item textures missing from --items. These tiles will
    // still render (colored square fallback), but users deserve to know.
    const usedBases = new Set<string>();
    for (const c of grid) usedBases.add(c.base);
    const missing: string[] = [];
    for (const base of usedBases) {
      if (!existsSync(join(args.itemsDir, `${base}.png`))) missing.push(base);
    }
    if (missing.length > 0) {
      missing.sort();
      console.warn(
        `  ! ${missing.length} item texture(s) missing from ${args.itemsDir}:\n    ${missing.join(", ")}\n    Guides will use flat color for these.`,
      );
    }

    const baseRenderOpts = {
      cellSize: args.cellSize,
      itemsDir: args.itemsDir,
      texturePadding: args.texturePadding,
      tileBorder: args.tileBorder,
      cellBorder: args.cellBorder,
      rulerMargin: args.rulerMargin,
    };

    // Per-tile guide images.
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i]!;
      const buf = await renderTileImage(t, args.tileSize, {
        ...baseRenderOpts,
        tileIndex: i + 1,
        tileTotal: tiles.length,
      });
      const name = `map_${t.gx}_${t.gy}.png`;
      await writeFile(join(args.outDir, name), buf);
      console.log(`  wrote ${name}`);
    }

    // Combined guide canvas.
    if (args.combined) {
      const buf = await renderCanvasImage(
        tiles,
        args.gridW,
        args.gridH,
        args.tileSize,
        baseRenderOpts,
      );
      await writeFile(join(args.outDir, "canvas.png"), buf);
      console.log("  wrote canvas.png");
    }
  }

  // Summary JSON.
  if (args.summary) {
    const totals: Record<string, number> = {};
    const perTile: Record<string, Record<string, number>> = {};
    for (const t of tiles) {
      const key = `map_${t.gx}_${t.gy}`;
      const counts: Record<string, number> = {};
      for (const c of t.cells) {
        totals[c.base] = (totals[c.base] ?? 0) + 1;
        counts[c.base] = (counts[c.base] ?? 0) + 1;
      }
      perTile[key] = counts;
    }
    const inputName = basename(args.input, extname(args.input));
    const inputHash = createHash("sha256")
      .update(readFileSync(args.input))
      .digest("hex");
    // Hash the subset of args that actually affects output. Absolute paths
    // are normalized to basenames to keep the hash portable.
    const hashableArgs = {
      gridW: args.gridW,
      gridH: args.gridH,
      tileSize: args.tileSize,
      dither: args.dither,
      metric: args.metric,
      clickBias: args.clickBias,
      gammaDither: args.gammaDither,
      fit: args.fit,
      aspectAuto: args.aspectAuto,
      adjustments: args.adjustments,
      palette: basename(args.palette),
    };
    const argsHash = createHash("sha256")
      .update(JSON.stringify(hashableArgs))
      .digest("hex")
      .slice(0, 16);
    const summary = {
      input: inputName,
      canvas: { width: args.gridW, height: args.gridH },
      inputHash,
      argsHash,
      args: hashableArgs,
      totals,
      perTile,
    };
    await writeFile(
      join(args.outDir, "summary.json"),
      JSON.stringify(summary, null, 2),
    );
    console.log("  wrote summary.json");
  }

  console.log(`Done. Output -> ${args.outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
