// Browser-side image preparation. Quantization and tile-splitting moved
// to @artmapify/core; this file owns just the canvas-bound stages:
//   1. Decode Blob -> ImageBitmap.
//   2. Resize onto target canvas using the selected fit mode.
//   3. Apply brightness / contrast / saturation / filter / sharpness
//      on the ImageData pixel buffer.

import { withBasePath } from "./base-path";
import type {
  Adjustments,
  DitherMethod,
  FitMode,
  Palette,
  RawImage,
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
async function loadItemTexture(base: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(withBasePath(`/items/${base}.png`));
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

function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v | 0;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  // Fallback for environments without OffscreenCanvas. Web workers always
  // have it; this branch only fires on the main thread in old browsers.
  if (typeof document === "undefined") {
    throw new Error(
      "OffscreenCanvas unavailable and no document to fall back to",
    );
  }
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
  return ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}
