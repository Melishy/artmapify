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
} from "./types.ts";
export { DEFAULT_ADJUSTMENTS } from "./types.ts";

export {
  clickCost,
  closestEntry,
  mcMapByte,
  packRgb,
  parsePaletteCsv,
  shadeOffset,
} from "./palette.ts";
export { quantize, splitIntoTiles } from "./quantize.ts";
export { resolveAspect, type AspectAutoResult } from "./aspect.ts";
export { BUILTIN_PALETTE_CSV } from "./palette-data.ts";
export {
  exportArtMap,
  exportArtMapTile,
  isUuid,
  offlinePlayerUuid,
  todayDDMMYYYY,
  type ArtMapTileExport,
  type ExportArtMapOptions,
} from "./artmap-export.ts";

import { parsePaletteCsv } from "./palette.ts";
import { BUILTIN_PALETTE_CSV } from "./palette-data.ts";

/**
 * Parse the palette bundled with @artmapify/core. The same source file
 * the CLI ships with on disk (core/palette.csv), embedded as a string so
 * the web app doesn't need a separate runtime fetch.
 */
export function loadBuiltinPalette() {
  return parsePaletteCsv(BUILTIN_PALETTE_CSV);
}
