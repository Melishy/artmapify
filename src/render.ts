import sharp from "sharp";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PaletteEntry } from "./palette.js";
import type { Tile } from "./image.js";

/**
 * 5x7 pixel glyphs for digits 0..9. Each inner string row is 5 chars wide,
 * '#' = pixel on, '.' = pixel off. Stored top-to-bottom.
 */
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

export interface RenderOptions {
  /** Pixel size of one output cell (e.g. 32). */
  cellSize: number;
  /** Directory containing item textures (`<base>.png`). */
  itemsDir: string;
  /** Pixel scale for the digit glyph (e.g. 2 => glyph is 10x14). */
  digitScale?: number;
  /** Alpha (0..255) applied to the item texture overlay, so bg color shows. */
  textureAlpha?: number;
  /** Where to place the digit: 'br' = bottom-right (default), 'tr' = top-right, etc. */
  digitCorner?: "br" | "tr" | "bl" | "tl";
  /**
   * Fraction of the cell to leave as a colored border around the texture,
   * on each side. 0 = texture fills the cell, 0.2 = 20% padding per side,
   * texture ends up 60% of the cell. Clamped to [0, 0.45].
   */
  texturePadding?: number;
  /**
   * Width in pixels of the black grid lines drawn between tiles on the
   * combined canvas image. 0 disables. Default 2.
   */
  tileBorder?: number;
  /**
   * Width in pixels of the black grid lines drawn between individual cells
   * in each per-tile guide image. 0 disables. Default 1.
   */
  cellBorder?: number;
  /**
   * Width in pixels of the coordinate-ruler margin added to the top and left
   * of each per-tile guide image. Column numbers (1..gridSize) go along the
   * top, row numbers down the left side. 0 disables. Default 24.
   */
  rulerMargin?: number;
  /**
   * 1-based index of this tile in the full canvas, used to stamp a
   * "tileIndex/tileTotal" label in the top-left ruler corner. Both
   * `tileIndex` and `tileTotal` must be provided for the label to appear.
   */
  tileIndex?: number;
  /** Total tile count in the full canvas; see `tileIndex`. */
  tileTotal?: number;
  /**
   * When true (default), cell borders are drawn only between cells that
   * differ in (base, shade). Adjacent cells that share the same dye +
   * shade are joined into a "run" with no seam between them, which makes
   * large solid areas much easier to read on the guide.
   */
  outlineRuns?: boolean;
}

/**
 * Cache of cell images keyed by palette label, so every Raw Iron 2 cell
 * shares one buffer.
 */
type CellCache = Map<string, Buffer>;

/**
 * Render one map tile (gridSize x gridSize cells) into a PNG buffer.
 */
export async function renderTileImage(
  tile: Tile,
  gridSize: number,
  opts: RenderOptions,
): Promise<Buffer> {
  const cache: CellCache = new Map();
  const cellSize = opts.cellSize;
  const totalW = gridSize * cellSize;
  const totalH = gridSize * cellSize;
  const border = Math.max(0, Math.floor(opts.cellBorder ?? 1));

  // Build each unique cell image once.
  const composites: sharp.OverlayOptions[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const entry = tile.cells[y * gridSize + x]!;
      let cellBuf = cache.get(entry.label);
      if (!cellBuf) {
        cellBuf = await buildCellBuffer(entry, opts);
        cache.set(entry.label, cellBuf);
      }
      composites.push({
        input: cellBuf,
        top: y * cellSize,
        left: x * cellSize,
      });
    }
  }

  // Cell borders. When `outlineRuns` is on (default), seams between cells
  // that share the same (base, shade) are suppressed so solid runs become
  // visually one block. The outer border of the tile is always drawn.
  if (border > 0) {
    const half = Math.floor(border / 2);
    const black = { r: 0, g: 0, b: 0, alpha: 1 };
    const outlineRuns = opts.outlineRuns ?? true;
    const sameRun = (a: PaletteEntry, b: PaletteEntry): boolean =>
      outlineRuns && a.base === b.base && a.shade === b.shade;

    // Vertical segments. For each column seam c in 0..gridSize, and each row
    // r, draw a border-by-cellSize strip unless it's an interior seam
    // between two cells of the same run.
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
        composites.push({
          input: {
            create: {
              width: stripeW,
              height: cellSize,
              channels: 4,
              background: black,
            },
          },
          top: r * cellSize,
          left,
        });
      }
    }
    // Horizontal segments. Same idea, per column.
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
        composites.push({
          input: {
            create: {
              width: cellSize,
              height: stripeH,
              channels: 4,
              background: black,
            },
          },
          top,
          left: c * cellSize,
        });
      }
    }
  }

  const inner = await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();

  // If rulers are disabled, return the inner image directly.
  const margin = Math.max(0, Math.floor(opts.rulerMargin ?? 24));
  if (margin === 0) return inner;

  // Wrap with a white margin on top and left, and stamp column/row numbers.
  const outerW = totalW + margin;
  const outerH = totalH + margin;
  const rulerComposites: sharp.OverlayOptions[] = [
    { input: inner, top: margin, left: margin },
  ];

  // Pick a glyph scale that fits inside ~70% of the ruler margin, with a
  // minimum of 1, and also fits within the cell size so labels don't overlap.
  const glyphScale = Math.max(
    1,
    Math.min(
      Math.floor((margin * 0.7) / GLYPH_H),
      Math.floor((cellSize * 0.7) / GLYPH_W),
    ),
  );

  // Column labels (1..gridSize) along the top margin, centered over each cell.
  for (let c = 0; c < gridSize; c++) {
    const label = String(c + 1);
    const glyph = buildLabelGlyph(label, glyphScale);
    const cx = margin + c * cellSize + cellSize / 2;
    const cy = margin / 2;
    rulerComposites.push({
      input: glyph.image,
      raw: { width: glyph.width, height: glyph.height, channels: 4 },
      top: Math.max(0, Math.floor(cy - glyph.height / 2)),
      left: Math.max(0, Math.floor(cx - glyph.width / 2)),
    });
  }
  // Row labels (1..gridSize) along the left margin, centered on each cell row.
  for (let r = 0; r < gridSize; r++) {
    const label = String(r + 1);
    const glyph = buildLabelGlyph(label, glyphScale);
    const cx = margin / 2;
    const cy = margin + r * cellSize + cellSize / 2;
    rulerComposites.push({
      input: glyph.image,
      raw: { width: glyph.width, height: glyph.height, channels: 4 },
      top: Math.max(0, Math.floor(cy - glyph.height / 2)),
      left: Math.max(0, Math.floor(cx - glyph.width / 2)),
    });
  }

  // Tile "N/M" label in the top-left ruler corner (the margin x margin
  // square), when the caller supplied a tile index + total.
  if (
    typeof opts.tileIndex === "number" &&
    typeof opts.tileTotal === "number" &&
    opts.tileTotal > 0
  ) {
    const text = `${opts.tileIndex}/${opts.tileTotal}`;
    // Pick a label scale that fits inside the margin x margin corner.
    const labelW = text.length * GLYPH_W + Math.max(0, text.length - 1);
    const corner = Math.max(1, Math.floor(margin * 0.85));
    const cornerScale = Math.max(
      1,
      Math.min(Math.floor(corner / GLYPH_H), Math.floor(corner / labelW)),
    );
    const glyph = buildLabelGlyph(text, cornerScale);
    rulerComposites.push({
      input: glyph.image,
      raw: { width: glyph.width, height: glyph.height, channels: 4 },
      top: Math.max(0, Math.floor(margin / 2 - glyph.height / 2)),
      left: Math.max(0, Math.floor(margin / 2 - glyph.width / 2)),
    });
  }

  return sharp({
    create: {
      width: outerW,
      height: outerH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(rulerComposites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Render a pure pixel-art preview of the full canvas: one pixel per dye cell,
 * then optionally scaled up with nearest-neighbor. This is what the art will
 * look like in-game, and is the correct thing to compare against the source
 * image.
 */
export async function renderPreviewImage(
  tiles: Tile[],
  gridW: number,
  gridH: number,
  gridSize: number,
  scale = 1,
): Promise<Buffer> {
  const pxW = gridW * gridSize;
  const pxH = gridH * gridSize;
  const buf = Buffer.alloc(pxW * pxH * 3);

  for (const t of tiles) {
    const baseX = (t.gx - 1) * gridSize;
    const baseY = (t.gy - 1) * gridSize;
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const entry = t.cells[y * gridSize + x]!;
        const i = ((baseY + y) * pxW + (baseX + x)) * 3;
        buf[i] = entry.rgb[0];
        buf[i + 1] = entry.rgb[1];
        buf[i + 2] = entry.rgb[2];
      }
    }
  }

  let img = sharp(buf, { raw: { width: pxW, height: pxH, channels: 3 } });
  if (scale > 1) {
    img = img.resize(pxW * scale, pxH * scale, { kernel: "nearest" });
  }
  return img.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Render the full canvas as a "guide" image (textures + shade digits).
 * Useful for figuring out which dye goes where, not for previewing the result.
 */
export async function renderCanvasImage(
  tiles: Tile[],
  gridW: number,
  gridH: number,
  gridSize: number,
  opts: RenderOptions,
): Promise<Buffer> {
  const cellSize = opts.cellSize;
  const tilePx = gridSize * cellSize;
  const border = Math.max(0, Math.floor(opts.tileBorder ?? 2));
  const canvasW = gridW * tilePx;
  const canvasH = gridH * tilePx;

  // Tiles inside the combined canvas get no per-cell grid and no rulers;
  // the canvas only shows tile-level grid lines.
  const tileOpts: RenderOptions = { ...opts, cellBorder: 0, rulerMargin: 0 };
  const composites: sharp.OverlayOptions[] = [];
  for (const t of tiles) {
    const buf = await renderTileImage(t, gridSize, tileOpts);
    composites.push({
      input: buf,
      top: (t.gy - 1) * tilePx,
      left: (t.gx - 1) * tilePx,
    });
  }

  // Black grid lines between tiles. Drawn on top of the composites as thin
  // opaque-black strips. Lines are centered on the tile seams so they cover
  // half of each neighbouring tile.
  if (border > 0) {
    const half = Math.floor(border / 2);
    const black = { r: 0, g: 0, b: 0, alpha: 1 };
    // Vertical lines: between columns, plus outer left/right edges.
    for (let c = 0; c <= gridW; c++) {
      const x = c * tilePx;
      const left = Math.max(0, Math.min(canvasW - border, x - half));
      const stripeW = Math.min(border, canvasW - left);
      if (stripeW <= 0) continue;
      composites.push({
        input: {
          create: {
            width: stripeW,
            height: canvasH,
            channels: 4,
            background: black,
          },
        },
        top: 0,
        left,
      });
    }
    // Horizontal lines: between rows, plus outer top/bottom edges.
    for (let r = 0; r <= gridH; r++) {
      const y = r * tilePx;
      const top = Math.max(0, Math.min(canvasH - border, y - half));
      const stripeH = Math.min(border, canvasH - top);
      if (stripeH <= 0) continue;
      composites.push({
        input: {
          create: {
            width: canvasW,
            height: stripeH,
            channels: 4,
            background: black,
          },
        },
        top,
        left: 0,
      });
    }
  }

  return sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Build one cell: colored background + inset texture + shade digit. */
async function buildCellBuffer(
  entry: PaletteEntry,
  opts: RenderOptions,
): Promise<Buffer> {
  const size = opts.cellSize;
  const [r, g, b] = entry.rgb;

  const padRatio = Math.min(0.45, Math.max(0, opts.texturePadding ?? 0.2));
  const pad = Math.floor(size * padRatio);
  const texSize = Math.max(1, size - pad * 2);

  const layers: sharp.OverlayOptions[] = [];

  // Texture overlay (optional - only if the texture file exists).
  const texPath = join(opts.itemsDir, `${entry.base}.png`);
  if (existsSync(texPath)) {
    const alpha = opts.textureAlpha ?? 255;
    let tex = sharp(texPath)
      .resize(texSize, texSize, { kernel: "nearest" })
      .ensureAlpha();
    if (alpha < 255) {
      tex = tex.composite([
        {
          input: Buffer.from([255, 255, 255, alpha]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ]);
    }
    const texBuf = await tex.png().toBuffer();
    layers.push({ input: texBuf, top: pad, left: pad });
  }

  // Digit glyph.
  const digitScale = opts.digitScale ?? Math.max(1, Math.floor(size / 16));
  const glyphBuf = buildDigitGlyph(String(entry.shade), digitScale, r, g, b);
  const glyphW = GLYPH_W * digitScale;
  const glyphH = GLYPH_H * digitScale;
  const digitPad = Math.max(1, Math.floor(digitScale));
  const corner = opts.digitCorner ?? "br";
  let top = size - glyphH - digitPad;
  let left = size - glyphW - digitPad;
  if (corner === "tr") {
    top = digitPad;
    left = size - glyphW - digitPad;
  } else if (corner === "tl") {
    top = digitPad;
    left = digitPad;
  } else if (corner === "bl") {
    top = size - glyphH - digitPad;
    left = digitPad;
  }

  layers.push({
    input: glyphBuf.image,
    top,
    left,
    raw: { width: glyphBuf.width, height: glyphBuf.height, channels: 4 },
  });

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

/**
 * Build a raw RGBA buffer of a scaled-up digit glyph with a 1px-scaled
 * outline, so it stays readable over any background color.
 * Uses white fill with black outline if the cell color is bright, and vice versa.
 */
function buildDigitGlyph(
  digit: string,
  scale: number,
  bgR: number,
  bgG: number,
  bgB: number,
): { image: Buffer; width: number; height: number } {
  const rows = GLYPHS[digit];
  if (!rows) throw new Error(`No glyph for digit '${digit}'`);

  const w = GLYPH_W * scale;
  const h = GLYPH_H * scale;
  const out = Buffer.alloc(w * h * 4, 0);

  // Pick fg/outline based on background luminance.
  const lum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
  const fg = lum < 128 ? [255, 255, 255] : [0, 0, 0];
  const outline = lum < 128 ? [0, 0, 0] : [255, 255, 255];

  // First pass: write fg pixels.
  // Second pass: write outline pixels (any neighbor of fg that isn't fg).
  const isOn = (gx: number, gy: number): boolean => {
    if (gx < 0 || gx >= GLYPH_W || gy < 0 || gy >= GLYPH_H) return false;
    return rows[gy]![gx] === "#";
  };

  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      const on = isOn(gx, gy);
      const nearOn =
        !on &&
        (isOn(gx - 1, gy) ||
          isOn(gx + 1, gy) ||
          isOn(gx, gy - 1) ||
          isOn(gx, gy + 1) ||
          isOn(gx - 1, gy - 1) ||
          isOn(gx + 1, gy - 1) ||
          isOn(gx - 1, gy + 1) ||
          isOn(gx + 1, gy + 1));
      if (!on && !nearOn) continue;
      const color = on ? fg : outline;
      // Fill the scaled block.
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = gx * scale + sx;
          const py = gy * scale + sy;
          const idx = (py * w + px) * 4;
          out[idx] = color[0]!;
          out[idx + 1] = color[1]!;
          out[idx + 2] = color[2]!;
          out[idx + 3] = 255;
        }
      }
    }
  }

  return { image: out, width: w, height: h };
}
/**
 * Build a raw RGBA buffer for a multi-digit label in solid black on a
 * transparent background, for use in the ruler margins of tile images.
 * Digits are separated by a 1px-scaled gap.
 */
function buildLabelGlyph(
  label: string,
  scale: number,
): { image: Buffer; width: number; height: number } {
  const gap = scale;
  const digitW = GLYPH_W * scale;
  const digitH = GLYPH_H * scale;
  const w = label.length * digitW + Math.max(0, label.length - 1) * gap;
  const h = digitH;
  const out = Buffer.alloc(w * h * 4, 0);

  for (let i = 0; i < label.length; i++) {
    const rows = GLYPHS[label[i]!];
    if (!rows) continue;
    const offsetX = i * (digitW + gap);
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (rows[gy]![gx] !== "#") continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = offsetX + gx * scale + sx;
            const py = gy * scale + sy;
            const idx = (py * w + px) * 4;
            out[idx] = 0;
            out[idx + 1] = 0;
            out[idx + 2] = 0;
            out[idx + 3] = 255;
          }
        }
      }
    }
  }

  return { image: out, width: w, height: h };
}
