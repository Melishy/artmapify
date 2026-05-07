// Off-main-thread pipeline runner. The web app debounces input changes,
// terminates this worker when superseded, and posts a fresh request for
// every settled-state run. Keeps the UI responsive even on big grids
// with dither enabled.
//
// Wire-in: see web/src/lib/pipeline-client.ts.

/// <reference lib="webworker" />

import { loadBuiltinPalette, type Palette } from "@artmapify/core";
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

ctx.addEventListener("message", async (e: MessageEvent<PipelineRequest>) => {
  const { id, blob, settings } = e.data;
  try {
    const palette = getPalette();
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
