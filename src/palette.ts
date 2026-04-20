import { readFileSync } from "node:fs";

export type RGB = readonly [number, number, number];

export interface PaletteEntry {
  /** Full label, e.g. "grass1" (1 is the default placed shade). */
  label: string;
  /** Base item name, e.g. "grass" */
  base: string;
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

function hexToRgb(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, "");
  if (s.length !== 6) return null;
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/**
 * Load the CSV palette. Expected columns (left to right, brightest to
 * darkest): Item, Color0, Color1, Color2, Color3.
 *
 * Column index = digit stamped on the guide = ArtMap shade action from the
 * default placed state:
 *   Color0 = one feather click (brightest)
 *   Color1 = as placed (default)
 *   Color2 = one coal click
 *   Color3 = two coal clicks (darkest)
 */
export function loadPalette(csvPath: string): Palette {
  const raw = readFileSync(csvPath, "utf8").replace(/\r\n/g, "\n").trim();
  const lines = raw.split("\n");
  const header = lines.shift();
  if (!header) throw new Error("Empty palette CSV");

  const entries: PaletteEntry[] = [];
  const byLabel = new Map<string, PaletteEntry>();
  const byRgb = new Map<number, PaletteEntry>();

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const item = cols[0];
    if (!item) continue;
    const base = item.toLowerCase().replace(/\s+/g, "_");

    // CSV columns 1..4 are brightest to darkest; shade digit = col - 1
    // (0 = feather once, 1 = placed, 2 = coal once, 3 = coal twice).
    for (let col = 1; col <= 4; col++) {
      const hex = cols[col];
      if (!hex) continue;
      const rgb = hexToRgb(hex);
      if (!rgb) continue;
      const shade = (col - 1) as 0 | 1 | 2 | 3;
      const label = `${base}${shade}`;
      const entry: PaletteEntry = {
        label,
        base,
        shade,
        rgb,
      };
      entries.push(entry);
      byLabel.set(label, entry);
      const key = packRgb(rgb[0], rgb[1], rgb[2]);
      // First one wins if multiple items share an exact color.
      if (!byRgb.has(key)) byRgb.set(key, entry);
    }
  }

  if (entries.length === 0) throw new Error("Palette has no valid colors");
  return { entries, byLabel, byRgb };
}

export type ColorMetric = "luma-hue" | "redmean" | "rgb";

/**
 * Number of dye-tool clicks required to reach each shade from the
 * default placed state.
 *   shade 0 = feather once    -> 1 click
 *   shade 1 = placed (default) -> 0 clicks
 *   shade 2 = coal once        -> 1 click
 *   shade 3 = coal twice       -> 2 clicks
 */
export function clickCost(shade: 0 | 1 | 2 | 3): number {
  return shade === 1 ? 0 : shade === 3 ? 2 : 1;
}

/**
 * Penalty added to each palette candidate's squared-distance score,
 * proportional to how many clicks it would cost in-game. Only affects
 * near-ties; the dominant term is always color distance.
 *
 * The penalty is `clickBias * cost * cost`. Defaults to 0 (off).
 * Useful values are 5..25 for a noticeable bias.
 */
export interface MatchOptions {
  metric?: ColorMetric;
  clickBias?: number;
}

/**
 * Find the palette entry whose rgb is perceptually closest to the given pixel,
 * using the selected metric.
 *
 * Metric trade-offs on the ArtMap palette:
 *
 *   'luma-hue' (default): luma + saturation-weighted hue, with a penalty
 *       for picking a tinted dye when the source is near-gray. Best for
 *       photographic or mixed content where grays must stay gray.
 *   'redmean': cheap perceptual approximation. Tends to keep dark tinted
 *       colors (dark greens, dark browns) intact but can push mid-gray
 *       pixels to green-tinted dyes.
 *   'rgb': plain squared Euclidean. Simplest; dark tinted colors often
 *       collapse to ink_sac due to the luminance gap in the palette.
 */
export function closestEntry(
  r: number,
  g: number,
  b: number,
  palette: Palette,
  metric: ColorMetric = "luma-hue",
  /**
   * Optional original (pre-dither) rgb of the pixel. When provided, the
   * 'luma-hue' metric uses this to decide whether the pixel is neutral or
   * saturated, instead of the possibly-drifted dithered rgb. This stops
   * error diffusion from accidentally pushing neutral regions onto tinted
   * dyes like warped_nylium or pink_dye.
   */
  ref?: readonly [number, number, number],
  clickBias = 0,
): PaletteEntry {
  // Fast path: exact match (only when there's no click bias, otherwise
  // we might still prefer a same-color entry with a lower click cost).
  if (clickBias <= 0) {
    const exact = palette.byRgb.get(packRgb(r, g, b));
    if (exact) return exact;
  }

  if (metric === "rgb") return closestRgb(r, g, b, palette, clickBias);
  if (metric === "redmean") return closestRedmean(r, g, b, palette, clickBias);
  return closestLumaHue(r, g, b, palette, ref, clickBias);
}

function closestRgb(
  r: number,
  g: number,
  b: number,
  palette: Palette,
  clickBias: number,
): PaletteEntry {
  let best = palette.entries[0]!;
  let bestDist = Infinity;
  for (const e of palette.entries) {
    const dr = r - e.rgb[0];
    const dg = g - e.rgb[1];
    const db = b - e.rgb[2];
    let d = dr * dr + dg * dg + db * db;
    if (clickBias > 0) {
      const c = clickCost(e.shade);
      d += clickBias * c * c;
    }
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

function closestRedmean(
  r: number,
  g: number,
  b: number,
  palette: Palette,
  clickBias: number,
): PaletteEntry {
  let best = palette.entries[0]!;
  let bestDist = Infinity;
  for (const e of palette.entries) {
    const rmean = (r + e.rgb[0]) >> 1;
    const dr = r - e.rgb[0];
    const dg = g - e.rgb[1];
    const db = b - e.rgb[2];
    let d =
      (((512 + rmean) * dr * dr) >> 8) +
      4 * dg * dg +
      (((767 - rmean) * db * db) >> 8);
    if (clickBias > 0) {
      const c = clickCost(e.shade);
      d += clickBias * c * c;
    }
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

function closestLumaHue(
  r: number,
  g: number,
  b: number,
  palette: Palette,
  ref: readonly [number, number, number] | undefined,
  clickBias: number,
): PaletteEntry {
  const yp = 0.299 * r + 0.587 * g + 0.114 * b;
  const up = b - yp;
  const vp = r - yp;
  // satGate = saturation of the pre-dither pixel when available, else the
  // dithered pixel. Used both for the hue weight and for the neutral bias
  // penalty so a gray *source* never picks a tinted dye even if error
  // diffusion has nudged the working rgb into tinted territory.
  let satGate: number;
  if (ref) {
    const rr = ref[0],
      rg = ref[1],
      rb = ref[2];
    const ry = 0.299 * rr + 0.587 * rg + 0.114 * rb;
    const ru = rb - ry;
    const rv = rr - ry;
    satGate = Math.sqrt(ru * ru + rv * rv);
  } else {
    satGate = Math.sqrt(up * up + vp * vp);
  }
  const hueWeight = Math.min(1, satGate / 40);

  let best = palette.entries[0]!;
  let bestDist = Infinity;
  for (const e of palette.entries) {
    const er = e.rgb[0],
      eg = e.rgb[1],
      eb = e.rgb[2];
    const ye = 0.299 * er + 0.587 * eg + 0.114 * eb;
    const ue = eb - ye;
    const ve = er - ye;

    const dY = yp - ye;
    const dU = up - ue;
    const dV = vp - ve;

    const lumaTerm = 2 * dY * dY;
    const hueTerm = hueWeight * (dU * dU + dV * dV);
    const satE = Math.sqrt(ue * ue + ve * ve);
    const overSatPenalty = Math.max(0, satE - satGate);
    const neutralTerm = (1 - hueWeight) * overSatPenalty * overSatPenalty;
    let d = lumaTerm + hueTerm + neutralTerm;
    if (clickBias > 0) {
      const c = clickCost(e.shade);
      d += clickBias * c * c;
    }

    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}
