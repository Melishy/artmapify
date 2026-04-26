// Browser port of root src/image.ts. Uses Canvas 2D instead of sharp.
//
// Pipeline:
//   1. Decode Blob -> ImageBitmap.
//   2. Resize onto target canvas using the selected fit mode.
//   3. Apply brightness / contrast / saturation / filter / sharpness
//      on the ImageData pixel buffer.
//   4. quantize() matches each pixel to a palette entry, with optional
//      error-diffusion dither and neutral-bias damping (copied verbatim
//      from the node port, it's pure math).
//   5. splitIntoTiles() chops the grid into 32x32 map tiles.

import { closestEntry } from "./palette";
import type {
  Adjustments,
  ColorMetric,
  DitherMethod,
  FitMode,
  Palette,
  PaletteEntry,
  RawImage,
  Tile,
} from "./types";

export async function decodeBlob(blob: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(blob);
}

/**
 * Load an item texture by base name, from /items/<base>.png.
 *
 * Animated Minecraft textures (like crimson_hyphae, warped_hyphae,
 * magma_block, prismarine, etc.) ship as a vertical strip of square
 * frames stacked top-to-bottom. If we detect a non-square texture, we
 * crop to the first frame (the top `width x width` square) so it
 * renders as a single block face instead of a squished ribbon.
 */
async function loadItemTexture(
  base: string,
): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(`/items/${base}.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    if (bmp.width === bmp.height) return bmp;
    const side = Math.min(bmp.width, bmp.height);
    const frame = await createImageBitmap(bmp, 0, 0, side, side);
    bmp.close();
    return frame;
  } catch {
    return null;
  }
}

/**
 * Preload item textures for every base present in a palette. Missing
 * textures are silently skipped; the renderer will fall back to the
 * solid cell color.
 */
export async function loadItemTextures(
  palette: Palette,
): Promise<Map<string, ImageBitmap>> {
  const bases = new Set<string>();
  for (const e of palette.entries) bases.add(e.base);
  const out = new Map<string, ImageBitmap>();
  await Promise.all(
    [...bases].map(async (b) => {
      const tex = await loadItemTexture(b);
      if (tex) out.set(b, tex);
    }),
  );
  return out;
}

/**
 * Resize + color-adjust + filter the source image onto a (gridW*tileSize) x
 * (gridH*tileSize) canvas, return the raw RGBA buffer.
 */
export async function prepareImage(
  source: ImageBitmap,
  gridW: number,
  gridH: number,
  tileSize: number,
  adj: Adjustments,
  _dither: DitherMethod,
  fit: FitMode = "fill",
): Promise<RawImage> {
  const targetW = gridW * tileSize;
  const targetH = gridH * tileSize;

  // Resize via 2D canvas with the browser's high-quality scaler (roughly
  // bicubic/Lanczos-ish; not identical to sharp's lanczos3 but close).
  const canvas = makeCanvas(targetW, targetH);
  const ctx = get2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fill black behind, matching sharp's background { r:0, g:0, b:0 }.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, targetW, targetH);

  const { dx, dy, dw, dh } = computeFitRect(
    source.width,
    source.height,
    targetW,
    targetH,
    fit,
  );
  ctx.drawImage(source, dx, dy, dw, dh);

  // Pixel-space adjustments.
  const img = ctx.getImageData(0, 0, targetW, targetH);
  applyAdjustments(img, adj);
  ctx.putImageData(img, 0, 0);

  // Sharpness (3x3 unsharp mask, applied on top of the adjusted image).
  if (adj.sharpness !== 1) {
    applySharpness(canvas, adj.sharpness);
  }

  // Filter pass (grayscale / sepia) goes last, matching sharp's ordering
  // of modulate -> linear -> sharpen -> recomb/grayscale.
  if (adj.filter !== "none") {
    const img2 = get2d(canvas).getImageData(0, 0, targetW, targetH);
    applyFilter(img2, adj.filter);
    get2d(canvas).putImageData(img2, 0, 0);
  }

  const finalImg = get2d(canvas).getImageData(0, 0, targetW, targetH);
  return {
    data: finalImg.data,
    width: targetW,
    height: targetH,
  };
}

function computeFitRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fit: FitMode,
): { dx: number; dy: number; dw: number; dh: number } {
  if (fit === "fill") return { dx: 0, dy: 0, dw: dstW, dh: dstH };
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  if (fit === "contain") {
    // Fit inside, letterbox.
    if (srcAspect > dstAspect) {
      const dw = dstW;
      const dh = dw / srcAspect;
      return { dx: 0, dy: (dstH - dh) / 2, dw, dh };
    } else {
      const dh = dstH;
      const dw = dh * srcAspect;
      return { dx: (dstW - dw) / 2, dy: 0, dw, dh };
    }
  }
  // cover: fill, crop overflow.
  if (srcAspect > dstAspect) {
    const dh = dstH;
    const dw = dh * srcAspect;
    return { dx: (dstW - dw) / 2, dy: 0, dw, dh };
  } else {
    const dw = dstW;
    const dh = dw / srcAspect;
    return { dx: 0, dy: (dstH - dh) / 2, dw, dh };
  }
}

function applyAdjustments(img: ImageData, adj: Adjustments): void {
  const d = img.data;
  const b = adj.brightness;
  const c = adj.contrast;
  const s = adj.saturation;
  // Contrast: y = c*x + 128*(1-c) (midpoint 128), matching sharp.linear.
  const cOffset = 128 * (1 - c);
  const doB = b !== 1;
  const doC = c !== 1;
  const doS = s !== 1;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]!;
    let g = d[i + 1]!;
    let bl = d[i + 2]!;

    if (doB) {
      r = r * b;
      g = g * b;
      bl = bl * b;
    }
    if (doC) {
      r = c * r + cOffset;
      g = c * g + cOffset;
      bl = c * bl + cOffset;
    }
    if (doS) {
      // Saturation about luma (Rec.601), matching sharp.modulate roughly.
      const y = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = y + (r - y) * s;
      g = y + (g - y) * s;
      bl = y + (bl - y) * s;
    }

    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(bl);
  }
}

/**
 * 3x3 unsharp mask. sharpness=1 is no-op, >1 sharpens, <1 blurs.
 * Implemented by averaging with the source (<1) or subtracting blur (>1).
 */
function applySharpness(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  sharpness: number,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = get2d(canvas);
  const src = ctx.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  const sd = src.data;
  const od = out.data;
  // amount > 0 sharpen, < 0 blur.
  const amount = sharpness - 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 3x3 box blur sample.
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = (ny * w + nx) * 4;
          rSum += sd[ni]!;
          gSum += sd[ni + 1]!;
          bSum += sd[ni + 2]!;
          count++;
        }
      }
      const rb = rSum / count;
      const gb = gSum / count;
      const bb = bSum / count;
      const i = (y * w + x) * 4;
      const r = sd[i]!;
      const g = sd[i + 1]!;
      const b = sd[i + 2]!;
      // Unsharp mask: out = src + amount * (src - blur).
      // When amount < 0 (blur), this is src + amount*(src-blur) = (1+amount)*src - amount*blur,
      // interpolating toward the blur.
      od[i] = clamp255(r + amount * (r - rb));
      od[i + 1] = clamp255(g + amount * (g - gb));
      od[i + 2] = clamp255(b + amount * (b - bb));
      od[i + 3] = sd[i + 3]!;
    }
  }

  ctx.putImageData(out, 0, 0);
}

function applyFilter(img: ImageData, filter: Adjustments["filter"]): void {
  const d = img.data;
  if (filter === "grayscale") {
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      const v = clamp255(y);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
  } else if (filter === "sepia") {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;
      d[i] = clamp255(0.393 * r + 0.769 * g + 0.189 * b);
      d[i + 1] = clamp255(0.349 * r + 0.686 * g + 0.168 * b);
      d[i + 2] = clamp255(0.272 * r + 0.534 * g + 0.131 * b);
    }
  }
}

/** Same math as root src/image.ts#quantize, pure so it ports verbatim. */
export function quantize(
  raw: RawImage,
  palette: Palette,
  dither: DitherMethod,
  metric: ColorMetric = "luma-hue",
  clickBias = 0,
  gammaDither = false,
): PaletteEntry[] {
  const { width: w, height: h } = raw;
  const buf = new Float32Array(w * h * 3);
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
        const refY = 0.299 * refR + 0.587 * refG + 0.114 * refB;
        const refU = refB - refY;
        const refV = refR - refY;
        const refSat = Math.sqrt(refU * refU + refV * refV);
        if (refSat < 12) {
          const damp = 1 - refSat / 12;
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

function srgbToLinear255(v: number): number {
  const s = v / 255;
  const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  return lin * 255;
}

function linearToSrgb255(v: number): number {
  const lin = v / 255;
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

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function get2d(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context");
  return ctx as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
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
