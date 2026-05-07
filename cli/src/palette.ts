// Thin Node-side palette loader: reads a CSV from disk and delegates
// parsing + matching to @artmapify/core. When csvPath is null, falls
// back to the palette bundled inside @artmapify/core (the same source
// the validator regenerates).

import { readFileSync } from "node:fs";
import {
  loadBuiltinPalette,
  parsePaletteCsv,
  type Palette,
} from "@artmapify/core";

export function loadPalette(csvPath: string | null): Palette {
  if (csvPath === null) return loadBuiltinPalette();
  const text = readFileSync(csvPath, "utf8");
  return parsePaletteCsv(text);
}
