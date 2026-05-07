// Re-exports shared types from @artmapify/core so existing imports from
// "@/lib/types" keep working. Web-only types (DOM-flavored RenderOptions,
// orchestration PipelineSettings) live below.

export type {
  Adjustments,
  Cell,
  ColorMetric,
  DitherMethod,
  FitMode,
  Palette,
  PaletteEntry,
  RawImage,
  RGB,
  Tile,
} from "@artmapify/core";
export { DEFAULT_ADJUSTMENTS } from "@artmapify/core";

import type {
  Adjustments,
  ColorMetric,
  DitherMethod,
  FitMode,
} from "@artmapify/core";

/** Browser-flavored render options (canvas-bound texture map). */
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
