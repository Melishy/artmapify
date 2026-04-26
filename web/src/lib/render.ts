// Browser port of root src/render.ts. Uses Canvas 2D instead of sharp.
// Returns OffscreenCanvas / HTMLCanvasElement that callers can turn into
// Blobs, draw on screen, or upload.

import type {
  PaletteEntry,
  RenderOptions,
  Tile,
} from "./types";

// 5x7 pixel glyphs for digits 0..9 and '/'. Kept identical to node port so
// outputs line up bit-for-bit.
const GLYPHS: Record<string, string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#...#", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "#...#", ".###."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Any2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function get2d(c: AnyCanvas): Any2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context");
  return ctx as Any2D;
}

/** Render one map tile into a canvas. */
export function renderTileCanvas(
  tile: Tile,
  gridSize: number,
  opts: RenderOptions,
): AnyCanvas {
  const cellSize = opts.cellSize;
  const totalW = gridSize * cellSize;
  const totalH = gridSize * cellSize;
  const border = Math.max(0, Math.floor(opts.cellBorder ?? 1));

  // Inner canvas first (no rulers).
  const inner = makeCanvas(totalW, totalH);
  const ictx = get2d(inner);
  ictx.fillStyle = "#000";
  ictx.fillRect(0, 0, totalW, totalH);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const entry = tile.cells[y * gridSize + x]!;
      drawCell(ictx, entry, x * cellSize, y * cellSize, opts);
    }
  }

  if (border > 0) {
    drawCellBorders(ictx, tile, gridSize, cellSize, border, opts);
  }

  const margin = Math.max(0, Math.floor(opts.rulerMargin ?? 24));
  if (margin === 0) return inner;

  // Wrap with white ruler margins + column/row numbers + top-left tile label.
  const outerW = totalW + margin;
  const outerH = totalH + margin;
  const outer = makeCanvas(outerW, outerH);
  const octx = get2d(outer);
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, outerW, outerH);
  octx.drawImage(inner, margin, margin);

  const glyphScale = Math.max(
    1,
    Math.min(
      Math.floor((margin * 0.7) / GLYPH_H),
      Math.floor((cellSize * 0.7) / GLYPH_W),
    ),
  );

  for (let c = 0; c < gridSize; c++) {
    const label = String(c + 1);
    const glyph = renderLabelToCanvas(label, glyphScale, [0, 0, 0]);
    const cx = margin + c * cellSize + cellSize / 2;
    const cy = margin / 2;
    octx.drawImage(
      glyph,
      Math.max(0, Math.floor(cx - glyph.width / 2)),
      Math.max(0, Math.floor(cy - glyph.height / 2)),
    );
  }
  for (let r = 0; r < gridSize; r++) {
    const label = String(r + 1);
    const glyph = renderLabelToCanvas(label, glyphScale, [0, 0, 0]);
    const cx = margin / 2;
    const cy = margin + r * cellSize + cellSize / 2;
    octx.drawImage(
      glyph,
      Math.max(0, Math.floor(cx - glyph.width / 2)),
      Math.max(0, Math.floor(cy - glyph.height / 2)),
    );
  }

  if (
    typeof opts.tileIndex === "number" &&
    typeof opts.tileTotal === "number" &&
    opts.tileTotal > 0
  ) {
    const text = `${opts.tileIndex}/${opts.tileTotal}`;
    const labelW = text.length * GLYPH_W + Math.max(0, text.length - 1);
    const corner = Math.max(1, Math.floor(margin * 0.85));
    const cornerScale = Math.max(
      1,
      Math.min(Math.floor(corner / GLYPH_H), Math.floor(corner / labelW)),
    );
    const glyph = renderLabelToCanvas(text, cornerScale, [0, 0, 0]);
    octx.drawImage(
      glyph,
      Math.max(0, Math.floor(margin / 2 - glyph.width / 2)),
      Math.max(0, Math.floor(margin / 2 - glyph.height / 2)),
    );
  }

  return outer;
}

/** Pixel-art preview: one pixel per dye cell, optionally nearest-neighbor scaled up. */
export function renderPreviewCanvas(
  tiles: Tile[],
  gridW: number,
  gridH: number,
  gridSize: number,
  scale = 1,
): AnyCanvas {
  const pxW = gridW * gridSize;
  const pxH = gridH * gridSize;
  const small = makeCanvas(pxW, pxH);
  const sctx = get2d(small);
  const img = new ImageData(pxW, pxH);
  const d = img.data;

  for (const t of tiles) {
    const baseX = (t.gx - 1) * gridSize;
    const baseY = (t.gy - 1) * gridSize;
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const entry = t.cells[y * gridSize + x]!;
        const i = ((baseY + y) * pxW + (baseX + x)) * 4;
        d[i] = entry.rgb[0];
        d[i + 1] = entry.rgb[1];
        d[i + 2] = entry.rgb[2];
        d[i + 3] = 255;
      }
    }
  }
  sctx.putImageData(img, 0, 0);

  if (scale <= 1) return small;

  const big = makeCanvas(pxW * scale, pxH * scale);
  const bctx = get2d(big);
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, pxW * scale, pxH * scale);
  return big;
}

/** Full canvas guide image: tiles stitched together, with optional tile borders. */
export function renderCanvasImage(
  tiles: Tile[],
  gridW: number,
  gridH: number,
  gridSize: number,
  opts: RenderOptions,
): AnyCanvas {
  const cellSize = opts.cellSize;
  const tilePx = gridSize * cellSize;
  const border = Math.max(0, Math.floor(opts.tileBorder ?? 2));
  const canvasW = gridW * tilePx;
  const canvasH = gridH * tilePx;

  const tileOpts: RenderOptions = { ...opts, cellBorder: 0, rulerMargin: 0 };
  const canvas = makeCanvas(canvasW, canvasH);
  const ctx = get2d(canvas);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasW, canvasH);

  for (const t of tiles) {
    const tileCanvas = renderTileCanvas(t, gridSize, tileOpts);
    ctx.drawImage(tileCanvas, (t.gx - 1) * tilePx, (t.gy - 1) * tilePx);
  }

  if (border > 0) {
    ctx.fillStyle = "#000";
    const half = Math.floor(border / 2);
    for (let c = 0; c <= gridW; c++) {
      const x = c * tilePx;
      const left = Math.max(0, Math.min(canvasW - border, x - half));
      const stripeW = Math.min(border, canvasW - left);
      if (stripeW <= 0) continue;
      ctx.fillRect(left, 0, stripeW, canvasH);
    }
    for (let r = 0; r <= gridH; r++) {
      const y = r * tilePx;
      const top = Math.max(0, Math.min(canvasH - border, y - half));
      const stripeH = Math.min(border, canvasH - top);
      if (stripeH <= 0) continue;
      ctx.fillRect(0, top, canvasW, stripeH);
    }
  }

  return canvas;
}

// --- helpers ----------------------------------------------------------

function drawCell(
  ctx: Any2D,
  entry: PaletteEntry,
  x: number,
  y: number,
  opts: RenderOptions,
): void {
  const size = opts.cellSize;
  const [r, g, b] = entry.rgb;

  // Solid background.
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(x, y, size, size);

  // Texture overlay.
  const padRatio = Math.min(0.45, Math.max(0, opts.texturePadding ?? 0.2));
  const pad = Math.floor(size * padRatio);
  const texSize = Math.max(1, size - pad * 2);
  const tex = opts.itemTextures.get(entry.base);
  if (tex) {
    const alpha = (opts.textureAlpha ?? 255) / 255;
    // Nearest-neighbor scale for the texture, matching sharp's kernel:"nearest".
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.drawImage(tex, x + pad, y + pad, texSize, texSize);
    ctx.globalAlpha = prevAlpha;
    ctx.imageSmoothingEnabled = prev;
  }

  // Digit glyph.
  const digitScale =
    opts.digitScale ?? Math.max(1, Math.floor(size / 16));
  const glyphW = GLYPH_W * digitScale;
  const glyphH = GLYPH_H * digitScale;
  const digitPad = Math.max(1, Math.floor(digitScale));
  const corner = opts.digitCorner ?? "br";
  let top = y + size - glyphH - digitPad;
  let left = x + size - glyphW - digitPad;
  if (corner === "tr") {
    top = y + digitPad;
    left = x + size - glyphW - digitPad;
  } else if (corner === "tl") {
    top = y + digitPad;
    left = x + digitPad;
  } else if (corner === "bl") {
    top = y + size - glyphH - digitPad;
    left = x + digitPad;
  }
  drawDigit(ctx, String(entry.shade), left, top, digitScale, [r, g, b]);
}

function drawCellBorders(
  ctx: Any2D,
  tile: Tile,
  gridSize: number,
  cellSize: number,
  border: number,
  opts: RenderOptions,
): void {
  const totalW = gridSize * cellSize;
  const totalH = gridSize * cellSize;
  const half = Math.floor(border / 2);
  const outlineRuns = opts.outlineRuns ?? true;
  const sameRun = (a: PaletteEntry, b: PaletteEntry): boolean =>
    outlineRuns && a.base === b.base && a.shade === b.shade;
  ctx.fillStyle = "#000";

  for (let c = 0; c <= gridSize; c++) {
    const x = c * cellSize;
    const left = Math.max(0, Math.min(totalW - border, x - half));
    const stripeW = Math.min(border, totalW - left);
    if (stripeW <= 0) continue;
    for (let r = 0; r < gridSize; r++) {
      if (c > 0 && c < gridSize) {
        const leftCell = tile.cells[r * gridSize + (c - 1)]!;
        const rightCell = tile.cells[r * gridSize + c]!;
        if (sameRun(leftCell, rightCell)) continue;
      }
      ctx.fillRect(left, r * cellSize, stripeW, cellSize);
    }
  }
  for (let r = 0; r <= gridSize; r++) {
    const y = r * cellSize;
    const top = Math.max(0, Math.min(totalH - border, y - half));
    const stripeH = Math.min(border, totalH - top);
    if (stripeH <= 0) continue;
    for (let c = 0; c < gridSize; c++) {
      if (r > 0 && r < gridSize) {
        const topCell = tile.cells[(r - 1) * gridSize + c]!;
        const botCell = tile.cells[r * gridSize + c]!;
        if (sameRun(topCell, botCell)) continue;
      }
      ctx.fillRect(c * cellSize, top, cellSize, stripeH);
    }
  }
}

/**
 * Draw a single digit glyph with a 1px-scaled outline so it reads on any
 * background. Matches the node port: chooses white-on-black or black-on-white
 * based on background luminance.
 */
function drawDigit(
  ctx: Any2D,
  digit: string,
  x: number,
  y: number,
  scale: number,
  bg: readonly [number, number, number],
): void {
  const rows = GLYPHS[digit];
  if (!rows) return;
  const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  const fg = lum < 128 ? "#fff" : "#000";
  const outline = lum < 128 ? "#000" : "#fff";

  const isOn = (gx: number, gy: number): boolean => {
    if (gx < 0 || gx >= GLYPH_W || gy < 0 || gy >= GLYPH_H) return false;
    return rows[gy]![gx] === "#";
  };

  // First pass: outline.
  ctx.fillStyle = outline;
  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      if (isOn(gx, gy)) continue;
      const near =
        isOn(gx - 1, gy) ||
        isOn(gx + 1, gy) ||
        isOn(gx, gy - 1) ||
        isOn(gx, gy + 1) ||
        isOn(gx - 1, gy - 1) ||
        isOn(gx + 1, gy - 1) ||
        isOn(gx - 1, gy + 1) ||
        isOn(gx + 1, gy + 1);
      if (!near) continue;
      ctx.fillRect(x + gx * scale, y + gy * scale, scale, scale);
    }
  }
  // Second pass: fg.
  ctx.fillStyle = fg;
  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      if (!isOn(gx, gy)) continue;
      ctx.fillRect(x + gx * scale, y + gy * scale, scale, scale);
    }
  }
}

function renderLabelToCanvas(
  label: string,
  scale: number,
  color: readonly [number, number, number],
): AnyCanvas {
  const gap = scale;
  const digitW = GLYPH_W * scale;
  const digitH = GLYPH_H * scale;
  const w = label.length * digitW + Math.max(0, label.length - 1) * gap;
  const h = digitH;
  const canvas = makeCanvas(w, h);
  const ctx = get2d(canvas);
  // Transparent background by default.
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;

  for (let i = 0; i < label.length; i++) {
    const rows = GLYPHS[label[i]!];
    if (!rows) continue;
    const offsetX = i * (digitW + gap);
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (rows[gy]![gx] !== "#") continue;
        ctx.fillRect(offsetX + gx * scale, gy * scale, scale, scale);
      }
    }
  }

  return canvas;
}

/** Convert any canvas (off- or on-screen) to a PNG Blob. */
export async function canvasToBlob(canvas: AnyCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return await (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("canvas.toBlob returned null"));
    }, "image/png");
  });
}
