// Off-main-thread pipeline runner. The web app debounces input changes,
// terminates this worker when superseded, and posts a fresh request for
// every settled-state run. Keeps the UI responsive even on big grids
// with dither enabled.
//
// Wire-in: see web/src/lib/pipeline-client.ts.

/// <reference lib="webworker" />

import {
  loadBuiltinPalette,
  paletteFromEntries,
  type Palette,
} from "@artmapify/core";
import { runPipeline, type PipelineResult } from "@/lib/pipeline";
import type { PipelineSettings } from "@/lib/types";

export interface PipelineRequest {
  id: number;
  blob: Blob;
  settings: PipelineSettings;
}

export type PipelineResponse =
  | { id: number; ok: true; result: PipelineResult }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Palette never changes during a session, so parse it once and reuse.
let paletteCache: Palette | null = null;
function getPalette(): Palette {
  if (!paletteCache) paletteCache = loadBuiltinPalette();
  return paletteCache;
}

// Filtered palettes are cached per exclusion set so repeated runs with the
// same "dyes I have" selection reuse one object (which also preserves
// core's per-palette WeakMap caches across runs).
let filteredCache: { key: string; palette: Palette } | null = null;
function getFilteredPalette(excludedBases: string[] | undefined): Palette {
  const full = getPalette();
  if (!excludedBases || excludedBases.length === 0) return full;
  const key = [...excludedBases].sort().join(",");
  if (filteredCache?.key === key) return filteredCache.palette;
  const excluded = new Set(excludedBases);
  const entries = full.entries.filter((e) => !excluded.has(e.base));
  // Excluding everything would leave nothing to match; fall back to the
  // full palette rather than erroring out mid-edit.
  const palette = entries.length === 0 ? full : paletteFromEntries(entries);
  filteredCache = { key, palette };
  return palette;
}

ctx.addEventListener("message", async (e: MessageEvent<PipelineRequest>) => {
  const { id, blob, settings } = e.data;
  try {
    const palette = getFilteredPalette(settings.excludedBases);
    const result = await runPipeline(blob, palette, settings);
    const message: PipelineResponse = { id, ok: true, result };
    ctx.postMessage(message);
  } catch (err) {
    const message: PipelineResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(message);
  }
});
