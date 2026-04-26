// Browser port of root src/palette.ts. No fs; palette comes from a URL
// or a pre-fetched string.

import type { ColorMetric, Palette, PaletteEntry, RGB } from "./types";

function hexToRgb(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, "");
  if (s.length !== 6) return null;
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function parsePaletteCsv(text: string): Palette {
  const raw = text.replace(/\r\n/g, "\n").trim();
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
    const name = item.trim();
    const base = name.toLowerCase().replace(/\s+/g, "_");

    for (let col = 1; col <= 4; col++) {
      const hex = cols[col];
      if (!hex) continue;
      const rgb = hexToRgb(hex);
      if (!rgb) continue;
      const shade = (col - 1) as 0 | 1 | 2 | 3;
      const label = `${base}${shade}`;
      const entry: PaletteEntry = { label, base, name, shade, rgb };
      entries.push(entry);
      byLabel.set(label, entry);
      const key = packRgb(rgb[0], rgb[1], rgb[2]);
      if (!byRgb.has(key)) byRgb.set(key, entry);
    }
  }

  if (entries.length === 0) throw new Error("Palette has no valid colors");
  return { entries, byLabel, byRgb };
}

export async function loadPaletteFromUrl(url: string): Promise<Palette> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch palette: ${res.status}`);
  const text = await res.text();
  return parsePaletteCsv(text);
}

export function clickCost(shade: 0 | 1 | 2 | 3): number {
  return shade === 1 ? 0 : shade === 3 ? 2 : 1;
}

export function closestEntry(
  r: number,
  g: number,
  b: number,
  palette: Palette,
  metric: ColorMetric = "luma-hue",
  ref?: readonly [number, number, number],
  clickBias = 0,
): PaletteEntry {
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
