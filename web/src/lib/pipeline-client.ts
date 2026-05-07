"use client";

// Thin wrapper around the pipeline worker. Owns the worker lifecycle:
// one persistent worker per page, request IDs to ignore stale replies,
// and a hard `terminate()` if the caller wants to abandon all in-flight
// work.

import type {
  PipelineRequest,
  PipelineResponse,
} from "@/workers/pipeline.worker";
import type { PipelineResult } from "@/lib/pipeline";
import type { PipelineSettings } from "@/lib/types";

export class PipelineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (r: PipelineResult) => void;
      reject: (e: Error) => void;
    }
  >();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(
      new URL("../workers/pipeline.worker.ts", import.meta.url),
      { type: "module" },
    );
    w.addEventListener("message", (e: MessageEvent<PipelineResponse>) => {
      const slot = this.pending.get(e.data.id);
      if (!slot) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) slot.resolve(e.data.result);
      else slot.reject(new Error(e.data.error));
    });
    w.addEventListener("error", (e) => {
      // Treat a worker-level error as fatal: reject everything pending
      // and recreate on next call.
      const err = new Error(e.message || "Pipeline worker crashed");
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    });
    this.worker = w;
    return w;
  }

  /**
   * Send a pipeline request. Resolves with the result or rejects with an
   * Error. Caller is responsible for tracking which response is current
   * (typically by tagging each call with its own monotonic counter).
   */
  run(blob: Blob, settings: PipelineSettings): Promise<PipelineResult> {
    const w = this.ensureWorker();
    const id = this.nextId++;
    const request: PipelineRequest = { id, blob, settings };
    return new Promise<PipelineResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage(request);
    });
  }

  /**
   * Hard-stop: terminate the worker (canceling any in-flight runs) and
   * reject all pending promises. Next call to `run` spawns a fresh
   * worker. Use this on rapid setting changes when waiting for a
   * cancelled run is more expensive than restarting.
   */
  terminate(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    const cancelled = new Error("Pipeline run cancelled");
    for (const { reject } of this.pending.values()) reject(cancelled);
    this.pending.clear();
  }
}
