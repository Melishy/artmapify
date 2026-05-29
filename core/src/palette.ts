// Pure palette parsing + nearest-color lookup. No fs, no fetch - both
// platforms are responsible for getting the CSV text into memory however
// they like (readFileSync, fetch, etc) and then call parsePaletteCsv.

import type { ColorMetric, Palette, PaletteEntry, RGB } from "./types.ts";

// Per-entry values that depend only on the palette, not the pixel being
// matched. Computing the YUV decomposition and saturation magnitude of every
// dye once per palette (instead of once per pixel per dye) is the single
// biggest win in the luma-hue inner loop: it removes one Math.sqrt and a
// handful of multiplies from the hottest path in the whole pipeline.
interface LumaHueEntry {
  ye: number;
  ue: number;
  ve: number;
  satE: number;
  cost: number;
}

// Keyed by the palette object so each parsed palette computes this lazily on
// first use and reuses it forever. WeakMap lets a discarded palette get
// collected without us leaking the cache.
const lumaHueCache = new WeakMap<Palette, LumaHueEntry[]>();

function getLumaHueEntries(palette: Palette): LumaHueEntry[] {
  let cached = lumaHueCache.get(palette);
  if (cached) return cached;
  cached = palette.entries.map((e) => {
    const er = e.rgb[0],
      eg = e.rgb[1],
      eb = e.rgb[2];
    const ye = 0.299 * er + 0.587 * eg + 0.114 * eb;
    const ue = eb - ye;
    const ve = er - ye;
    return {
      ye,
      ue,
      ve,
      satE: Math.sqrt(ue * ue + ve * ve),
      cost: clickCost(e.shade),
    };
  });
  lumaHueCache.set(palette, cached);
  return cached;
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
 * Map our shade index (0..3, brightest -> darkest) to the byte offset
 * Minecraft map files use, per the wiki shade table:
 *
 *   shade 0 (mul 255, brightest)     -> mc shade 2
 *   shade 1 (mul 220, default)       -> mc shade 1
 *   shade 2 (mul 180)                -> mc shade 0
 *   shade 3 (mul 135, darkest)       -> mc shade 3
 *
 * The full Minecraft map byte for a pixel is `baseColorId * 4 + shadeOffset`.
 */
export function shadeOffset(shade: 0 | 1 | 2 | 3): number {
  switch (shade) {
    case 0:
      return 2;
    case 1:
      return 1;
    case 2:
      return 0;
    case 3:
      return 3;
  }
}

/**
 * Compute the unsigned 0..255 byte that a Minecraft map stores for a given
 * palette entry. Two entries with the same baseColorId but different shade
 * map to four distinct bytes, all of which decode to the same RGB triple
 * via the wiki's shade multipliers.
 */
export function mcMapByte(entry: PaletteEntry): number {
  return (entry.baseColorId * 4 + shadeOffset(entry.shade)) & 0xff;
}

/**
 * Parse the palette CSV. Expected columns (left to right): Item, BaseId,
 * Color0, Color1, Color2, Color3. The Color0..Color3 columns go from
 * brightest to darkest, matching the digit stamped on the guide and the
 * ArtMap shade action from the default placed state:
 *   Color0 = one feather click (brightest)
 *   Color1 = as placed (default)
 *   Color2 = one coal click
 *   Color3 = two coal clicks (darkest)
 */
export function parsePaletteCsv(text: string): Palette {
  const raw = text.replace(/\r\n/g, "\n").trim();
  const lines = raw.split("\n");
  const header = lines.shift();
  if (!header) throw new Error("Empty palette CSV");
  // Older palettes (pre-monorepo) skipped the BaseId column. Detect that
  // so we fail loudly instead of silently parsing rgb hex into baseColorId.
  if (!/(^|,)\s*BaseId\s*(,|$)/i.test(header)) {
    throw new Error(
      "palette CSV missing 'BaseId' column. Expected header: Item,BaseId,Color0,Color1,Color2,Color3",
    );
  }

  const entries: PaletteEntry[] = [];
  const byLabel = new Map<string, PaletteEntry>();
  const byRgb = new Map<number, PaletteEntry>();

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const item = cols[0];
    if (!item) continue;
    const name = item.trim();
    const base = name.toLowerCase().replace(/\s+/g, "_");
    const baseColorId = parseInt(cols[1] ?? "", 10);
    if (!Number.isFinite(baseColorId) || baseColorId < 1 || baseColorId > 63) {
      throw new Error(
        `Invalid BaseId for '${name}': '${cols[1]}'. Expected an integer 1..63.`,
      );
    }

    for (let col = 2; col <= 5; col++) {
      const hex = cols[col];
      if (!hex) continue;
      const rgb = hexToRgb(hex);
      if (!rgb) continue;
      const shade = (col - 2) as 0 | 1 | 2 | 3;
      const label = `${base}${shade}`;
      const entry: PaletteEntry = {
        label,
        base,
        name,
        baseColorId,
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
 * Find the palette entry whose rgb is perceptually closest to the given pixel.
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
 *
 * `clickBias` (default 0) adds `clickBias * cost^2` to each candidate's
 * distance, biasing near-ties toward shades that take fewer in-game
 * clicks. Useful values are 5..25 for a noticeable bias.
 *
 * `ref` is the pre-dither rgb of this pixel, when available. The
 * 'luma-hue' metric uses it as the saturation reference so that error
 * diffusion can't push a near-gray source pixel onto a tinted dye.
 */
export function closestEntry(
  r: number,
  g: number,
  b: number,
  palette: Palette,
  metric: ColorMetric = "luma-hue",
  ref?: readonly [number, number, number],
  clickBias = 0,
): PaletteEntry {
  // Fast path: exact match (skipped if click bias might prefer a same-color
  // entry with a lower click cost).
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

  // Per-entry YUV + saturation are precomputed once per palette, so the loop
  // below is pure arithmetic with no sqrt and no property chasing into rgb.
  const lh = getLumaHueEntries(palette);
  const entries = palette.entries;
  const n = entries.length;
  let best = entries[0]!;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const pe = lh[i]!;
    const dY = yp - pe.ye;
    const dU = up - pe.ue;
    const dV = vp - pe.ve;

    const lumaTerm = 2 * dY * dY;
    const hueTerm = hueWeight * (dU * dU + dV * dV);
    const overSatPenalty = pe.satE > satGate ? pe.satE - satGate : 0;
    const neutralTerm = (1 - hueWeight) * overSatPenalty * overSatPenalty;
    let d = lumaTerm + hueTerm + neutralTerm;
    if (clickBias > 0) {
      const c = pe.cost;
      d += clickBias * c * c;
    }

    if (d < bestDist) {
      bestDist = d;
      best = entries[i]!;
    }
  }
  return best;
}
