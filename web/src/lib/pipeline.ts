// Top-level pipeline: Blob + settings -> preview canvas + tiles + summary.
// Handles the aspect=auto rescaling from the CLI as well.

import { clickCost } from "./palette";
import {
  decodeBlob,
  prepareImage,
  quantize,
  splitIntoTiles,
} from "./image";
import type {
  Palette,
  PaletteEntry,
  PipelineSettings,
  Tile,
} from "./types";

export interface DyeCount {
  label: string;
  base: string;
  name: string;
  shade: 0 | 1 | 2 | 3;
  count: number;
  rgb: readonly [number, number, number];
}

export interface PipelineSummary {
  gridW: number;
  gridH: number;
  tileSize: number;
  totalCells: number;
  totalClicks: number;
  byLabel: DyeCount[];
  perTile: Array<{
    gx: number;
    gy: number;
    cells: number;
    clicks: number;
    byLabel: Record<string, number>;
  }>;
}

export interface PipelineResult {
  tiles: Tile[];
  grid: PaletteEntry[];
  width: number;
  height: number;
  settings: PipelineSettings;
  summary: PipelineSummary;
}

interface AspectAutoResult {
  gridW: number;
  gridH: number;
}

/**
 * If requested, rescale gridW/gridH to match the source aspect ratio,
 * keeping the same tile budget (gridW*gridH). Matches the CLI logic.
 */
export function resolveAspect(
  sourceW: number,
  sourceH: number,
  gridW: number,
  gridH: number,
  aspectAuto: boolean,
): AspectAutoResult {
  if (!aspectAuto) return { gridW, gridH };
  const budget = Math.max(1, gridW * gridH);
  const srcAspect = sourceW / sourceH;
  // Find integer w*h with w*h == budget (or nearby) and w/h closest to srcAspect.
  let bestW = gridW;
  let bestH = gridH;
  let bestDiff = Infinity;
  for (let w = 1; w <= budget; w++) {
    for (let h = 1; h <= budget; h++) {
      const area = w * h;
      if (area !== budget) continue;
      const diff = Math.abs(w / h - srcAspect);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestW = w;
        bestH = h;
      }
    }
  }
  return { gridW: bestW, gridH: bestH };
}

export async function runPipeline(
  blob: Blob,
  palette: Palette,
  settings: PipelineSettings,
): Promise<PipelineResult> {
  const source = await decodeBlob(blob);
  const raw = await prepareImage(
    source,
    settings.gridW,
    settings.gridH,
    settings.tileSize,
    settings.adjustments,
    settings.dither,
    settings.fit,
  );
  source.close?.();

  const grid = quantize(
    raw,
    palette,
    settings.dither,
    settings.metric,
    settings.clickBias,
    settings.gammaDither,
  );
  const tiles = splitIntoTiles(
    grid,
    raw.width,
    settings.gridW,
    settings.gridH,
    settings.tileSize,
  );

  const summary = buildSummary(tiles, settings);
  return {
    tiles,
    grid,
    width: raw.width,
    height: raw.height,
    settings,
    summary,
  };
}

function buildSummary(
  tiles: Tile[],
  settings: PipelineSettings,
): PipelineSummary {
  const byLabel = new Map<string, DyeCount>();
  const perTile: PipelineSummary["perTile"] = [];
  let totalClicks = 0;

  for (const t of tiles) {
    const local: Record<string, number> = {};
    let localClicks = 0;
    for (const e of t.cells) {
      local[e.label] = (local[e.label] ?? 0) + 1;
      localClicks += clickCost(e.shade);
      const agg = byLabel.get(e.label);
      if (agg) agg.count++;
      else
        byLabel.set(e.label, {
          label: e.label,
          base: e.base,
          name: e.name,
          shade: e.shade,
          count: 1,
          rgb: e.rgb,
        });
    }
    perTile.push({
      gx: t.gx,
      gy: t.gy,
      cells: t.cells.length,
      clicks: localClicks,
      byLabel: local,
    });
    totalClicks += localClicks;
  }

  const sorted = [...byLabel.values()].sort((a, b) => b.count - a.count);
  const totalCells =
    settings.gridW *
    settings.gridH *
    settings.tileSize *
    settings.tileSize;
  return {
    gridW: settings.gridW,
    gridH: settings.gridH,
    tileSize: settings.tileSize,
    totalCells,
    totalClicks,
    byLabel: sorted,
    perTile,
  };
}
