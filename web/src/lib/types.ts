// Shared types for the browser port of ArtMapify.
// Keep in sync with root src/palette.ts, src/image.ts, src/render.ts.

export type RGB = readonly [number, number, number];

export interface PaletteEntry {
  label: string;
  base: string;
  name: string;
  shade: 0 | 1 | 2 | 3;
  rgb: RGB;
}

export interface Palette {
  entries: PaletteEntry[];
  byLabel: Map<string, PaletteEntry>;
  byRgb: Map<number, PaletteEntry>;
}

export type ColorMetric = "luma-hue" | "redmean" | "rgb";

export type DitherMethod =
  | "none"
  | "floyd-steinberg"
  | "burkes"
  | "sierra-lite";

export type FitMode = "contain" | "cover" | "fill";

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

export interface Cell {
  x: number;
  y: number;
  entry: PaletteEntry;
}

export interface Tile {
  gx: number;
  gy: number;
  cells: PaletteEntry[];
}

export interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface RenderOptions {
  cellSize: number;
  /** Map of item base name -> HTMLImageElement | ImageBitmap for textures. */
  itemTextures: Map<string, ImageBitmap | HTMLImageElement>;
  digitScale?: number;
  textureAlpha?: number;
  digitCorner?: "br" | "tr" | "bl" | "tl";
  texturePadding?: number;
  tileBorder?: number;
  cellBorder?: number;
  rulerMargin?: number;
  tileIndex?: number;
  tileTotal?: number;
  outlineRuns?: boolean;
}

/** All the user-tunable inputs to the pipeline. */
export interface PipelineSettings {
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
  adjustments: Adjustments;
  /** Emit per-tile guides. */
  guide: boolean;
  /** Stitch all guide tiles into canvas.png. Requires guide=true. */
  combined: boolean;
}
