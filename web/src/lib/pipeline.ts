// Top-level pipeline: Blob + settings -> preview canvas + tiles + summary.
// Handles the aspect=auto rescaling from the CLI as well.

import { clickCost, quantize, splitIntoTiles } from "@artmapify/core";
import { decodeBlob, prepareImage } from "./image";
import type { Palette, PaletteEntry, PipelineSettings, Tile } from "./types";

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

// Re-export so existing imports from "@/lib/pipeline" keep working; the
// single implementation lives in core.
export { resolveAspect } from "@artmapify/core";

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
    settings.gridW * settings.gridH * settings.tileSize * settings.tileSize;
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
