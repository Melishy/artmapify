// Shared types used by both the CLI (Node + sharp) and the web app
// (browser + Canvas). Anything platform-specific stays in the consuming
// package.

export type RGB = readonly [number, number, number];

export interface PaletteEntry {
  /** Full label, e.g. "grass1" (1 is the default placed shade). */
  label: string;
  /** Base item name in snake_case, matching the texture filename. */
  base: string;
  /** Display name from the CSV "Item" column, e.g. "Grass". */
  name: string;
  /**
   * Mojang Map base color id (1..63). Combined with the shade offset this
   * yields the byte stored in a Minecraft `map_*.dat` file:
   *   mcByte = baseColorId * 4 + shadeOffset
   * where shadeOffset is one of {0, 1, 2, 3} and depends on the shade
   * column the entry came from. See `shadeOffset()` in palette.ts.
   */
  baseColorId: number;
  /**
   * Digit drawn on the guide. Matches ArtMap's click semantics from the
   * default placed state:
   *   0 = one feather click (brightest)
   *   1 = placed as-is (default)
   *   2 = one coal click
   *   3 = two coal clicks (darkest)
   */
  shade: 0 | 1 | 2 | 3;
  rgb: RGB;
}

export interface Palette {
  entries: PaletteEntry[];
  byLabel: Map<string, PaletteEntry>;
  /** Fast exact-match lookup keyed by packed rgb int. */
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

/** One map tile (32x32 cells) with its resolved dye grid. */
export interface Tile {
  /** 1-based x coordinate within the canvas grid. */
  gx: number;
  /** 1-based y coordinate within the canvas grid. */
  gy: number;
  /** Row-major (y * tileSize + x) entries for one tile. */
  cells: PaletteEntry[];
}

/** Raw pixel buffer that's the lingua franca between platform image stages. */
export interface RawImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}
