// Browser-side palette loader: fetches the CSV and delegates parsing
// + matching to @artmapify/core. Re-exports the shared helpers so
// existing "@/lib/palette" imports keep working.

import { parsePaletteCsv, type Palette } from "@artmapify/core";

export async function loadPaletteFromUrl(url: string): Promise<Palette> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch palette: ${res.status}`);
  const text = await res.text();
  return parsePaletteCsv(text);
}

export {
  clickCost,
  closestEntry,
  packRgb,
  parsePaletteCsv,
} from "@artmapify/core";
