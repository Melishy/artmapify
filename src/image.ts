import sharp from "sharp";
import {
  closestEntry,
  type ColorMetric,
  type Palette,
  type PaletteEntry,
} from "./palette.js";

export type DitherMethod =
  | "none"
  | "floyd-steinberg"
  | "burkes"
  | "sierra-lite";

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  filter: "none" | "grayscale" | "sepia";
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  sharpness: 1,
  filter: "none",
};

/** A single dye placement: grid position + resolved palette entry. */
export interface Cell {
  x: number;
  y: number;
  entry: PaletteEntry;
}

/** One map tile (32x32 cells) with its resolved dye grid. */
export interface Tile {
  gx: number; // 1-based
  gy: number; // 1-based
  /** 32*32 entries, row-major (y*32 + x). */
  cells: PaletteEntry[];
}

export type FitMode = "contain" | "cover" | "fill";

/**
 * Load an image, apply adjustments and filters, resize to the canvas pixel size.
 * Returns a raw RGBA buffer.
 *
 * `fit` controls how the source aspect ratio is handled:
 *   - 'fill' (default, back-compat): stretch to exact canvas size.
 *   - 'cover': fill the canvas and crop overflow (no distortion).
 *   - 'contain': fit inside the canvas with letterbox bars.
 */
export async function prepareImage(
  inputPath: string,
  gridW: number,
  gridH: number,
  tileSize: number,
  adj: Adjustments,
  dither: DitherMethod,
  fit: FitMode = "fill",
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const targetW = gridW * tileSize;
  const targetH = gridH * tileSize;

  let img = sharp(inputPath)
    .removeAlpha()
    .resize(targetW, targetH, {
      kernel: "lanczos3",
      fit,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    });

  // Brightness + saturation via HSL-ish modulation, sharpness via sigma.
  // sharp.modulate: brightness (mult), saturation (mult). No native contrast.
  if (adj.brightness !== 1 || adj.saturation !== 1) {
    img = img.modulate({
      brightness: adj.brightness,
      saturation: adj.saturation,
    });
  }

  // Contrast: linear(a, b) where a=contrast, b=offset shifting midpoint.
  // y = a*x + b. For symmetric contrast about 128: b = 128*(1 - a).
  if (adj.contrast !== 1) {
    img = img.linear(adj.contrast, 128 * (1 - adj.contrast));
  }

  // Sharpness: map 1.0 = no-op, >1 sharpen, <1 blur.
  if (adj.sharpness > 1) {
    img = img.sharpen({ sigma: (adj.sharpness - 1) * 2 });
  } else if (adj.sharpness < 1) {
    img = img.blur(Math.max(0.3, (1 - adj.sharpness) * 2));
  }

  if (adj.filter === "grayscale") {
    img = img.grayscale().toColorspace("srgb");
  } else if (adj.filter === "sepia") {
    // Standard sepia matrix applied via recomb.
    img = img.recomb([
      [0.393, 0.769, 0.189],
      [0.349, 0.686, 0.168],
      [0.272, 0.534, 0.131],
    ]);
  }

  // (intentionally no automatic contrast boost here - crushes dark images
  // into ink_sac. Use --contrast if you want one.)
  void dither;

  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

/**
 * Quantize the prepared image to the palette, optionally dithering.
 * Returns a 2D grid (width x height) of palette entries.
 *
 * `clickBias` (default 0) adds a small cost penalty to each palette
 * candidate proportional to how many dye-tool clicks that shade needs
 * in-game. With 0 this is a pure color match; values like 8..16 nudge
 * near-ties toward the default (placed) shade, saving real-world clicks.
 *
 * `gammaDither` (default false) performs the error-diffusion step in
 * linear-light space instead of sRGB. This gives cleaner gradients,
 * especially on skin tones and dark photographic content. The palette
 * match itself is still done in sRGB so existing luma-hue thresholds
 * keep their meaning.
 */
export function quantize(
  raw: { data: Uint8Array; width: number; height: number },
  palette: Palette,
  dither: DitherMethod,
  metric: ColorMetric = "luma-hue",
  clickBias = 0,
  gammaDither = false,
): PaletteEntry[] {
  const { width: w, height: h } = raw;
  // Working buffer holds the "effective" pixel value with diffused error
  // folded in. If gamma-correct dither is on, this is linear 0..255,
  // otherwise sRGB 0..255.
  const buf = new Float32Array(w * h * 3);
  // Untouched copy of the original sRGB pixels, used for the neutral-bias
  // gate in closestEntry (so error diffusion can't push a gray source onto
  // a tinted dye).
  const orig = new Uint8Array(w * h * 3);

  if (gammaDither) {
    for (let i = 0, j = 0; i < raw.data.length; i += 4, j += 3) {
      const sr = raw.data[i]!;
      const sg = raw.data[i + 1]!;
      const sb = raw.data[i + 2]!;
      buf[j] = srgbToLinear255(sr);
      buf[j + 1] = srgbToLinear255(sg);
      buf[j + 2] = srgbToLinear255(sb);
      orig[j] = sr;
      orig[j + 1] = sg;
      orig[j + 2] = sb;
    }
  } else {
    for (let i = 0, j = 0; i < raw.data.length; i += 4, j += 3) {
      buf[j] = raw.data[i]!;
      buf[j + 1] = raw.data[i + 1]!;
      buf[j + 2] = raw.data[i + 2]!;
      orig[j] = raw.data[i]!;
      orig[j + 1] = raw.data[i + 1]!;
      orig[j + 2] = raw.data[i + 2]!;
    }
  }

  const result: PaletteEntry[] = new Array(w * h);
  const weights = DITHER_WEIGHTS[dither];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      const or = buf[idx]!;
      const og = buf[idx + 1]!;
      const ob = buf[idx + 2]!;
      // Effective sRGB pixel used for palette matching: convert back from
      // linear space when gamma dithering is on, else use as-is.
      const sr = gammaDither ? linearToSrgb255(or) : clamp255(or);
      const sg = gammaDither ? linearToSrgb255(og) : clamp255(og);
      const sb = gammaDither ? linearToSrgb255(ob) : clamp255(ob);
      const refR = orig[idx]!;
      const refG = orig[idx + 1]!;
      const refB = orig[idx + 2]!;
      const entry = closestEntry(
        sr,
        sg,
        sb,
        palette,
        metric,
        [refR, refG, refB],
        clickBias,
      );
      result[y * w + x] = entry;

      if (weights) {
        // Error = working value - matched entry value, in the working space.
        const entryR = gammaDither
          ? srgbToLinear255(entry.rgb[0])
          : entry.rgb[0];
        const entryG = gammaDither
          ? srgbToLinear255(entry.rgb[1])
          : entry.rgb[1];
        const entryB = gammaDither
          ? srgbToLinear255(entry.rgb[2])
          : entry.rgb[2];
        let er = or - entryR;
        let eg = og - entryG;
        let eb = ob - entryB;
        // If the *original* pixel is near-neutral, damp the chroma component
        // of the diffused error so we don't accumulate tint in gray regions.
        // Luma error is preserved so gradients still dither cleanly.
        const refY = 0.299 * refR + 0.587 * refG + 0.114 * refB;
        const refU = refB - refY;
        const refV = refR - refY;
        const refSat = Math.sqrt(refU * refU + refV * refV);
        if (refSat < 12) {
          // Ramp from full-damp (sat=0) to no-damp (sat=12).
          const damp = 1 - refSat / 12; // 0..1
          const avg = (er + eg + eb) / 3;
          er = er * (1 - damp) + avg * damp;
          eg = eg * (1 - damp) + avg * damp;
          eb = eb * (1 - damp) + avg * damp;
        }
        for (const [dx, dy, wgt] of weights) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nidx = (ny * w + nx) * 3;
          buf[nidx] += er * wgt;
          buf[nidx + 1] += eg * wgt;
          buf[nidx + 2] += eb * wgt;
        }
      }
    }
  }

  return result;
}

/** sRGB byte (0..255) -> linear light (0..255). */
function srgbToLinear255(v: number): number {
  const s = v / 255;
  const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  return lin * 255;
}

/** Linear light (0..255) -> sRGB byte (0..255), clamped. */
function linearToSrgb255(v: number): number {
  let lin = v / 255;
  if (lin <= 0) return 0;
  if (lin >= 1) return 255;
  const s =
    lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
  const out = s * 255;
  return out < 0 ? 0 : out > 255 ? 255 : out | 0;
}

function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v | 0;
}

/** Split the quantized grid into 32x32 map tiles. */
export function splitIntoTiles(
  grid: PaletteEntry[],
  width: number,
  gridW: number,
  gridH: number,
  tileSize: number,
): Tile[] {
  const tiles: Tile[] = [];
  for (let ty = 0; ty < gridH; ty++) {
    for (let tx = 0; tx < gridW; tx++) {
      const cells: PaletteEntry[] = new Array(tileSize * tileSize);
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const sx = tx * tileSize + x;
          const sy = ty * tileSize + y;
          cells[y * tileSize + x] = grid[sy * width + sx]!;
        }
      }
      tiles.push({ gx: tx + 1, gy: ty + 1, cells });
    }
  }
  return tiles;
}

const DITHER_WEIGHTS: Record<
  DitherMethod,
  ReadonlyArray<readonly [number, number, number]> | null
> = {
  none: null,
  "floyd-steinberg": [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
  burkes: [
    [1, 0, 8 / 32],
    [2, 0, 4 / 32],
    [-2, 1, 2 / 32],
    [-1, 1, 4 / 32],
    [0, 1, 8 / 32],
    [1, 1, 4 / 32],
    [2, 1, 2 / 32],
  ],
  "sierra-lite": [
    [1, 0, 2 / 4],
    [-1, 1, 1 / 4],
    [0, 1, 1 / 4],
  ],
};
