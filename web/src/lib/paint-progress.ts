"use client";

// Paint-along progress tracking. One bit per dye cell, keyed by a
// fingerprint of the source image + canvas geometry, persisted in
// localStorage so a half-painted project survives reloads and revisits.
//
// Key design points:
//   - The key hashes the image bytes (SHA-256, first 16 hex chars), not the
//     file name, so re-uploading the same picture resumes progress even
//     from a differently named file. Geometry is part of the key because
//     changing grid size or tile size renumbers every cell.
//   - Progress is a Uint8Array bitset (cells/8 bytes), base64'd for
//     storage. A 10x10 grid of 32x32 tiles is 102400 cells = 12.8 KB,
//     well within localStorage budgets.
//   - Writes are debounced (mutations update React state immediately,
//     storage at most every 400ms) and flushed when the key changes or
//     the owning component unmounts.
//   - Only the most recent MAX_PROJECTS projects are kept.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const KEY = "artmapify:paint:v1";
const MAX_PROJECTS = 8;
const SAVE_DEBOUNCE_MS = 400;

interface StoredProject {
  /** base64 bitset. */
  bits: string;
  /** Total cell count the bitset was sized for (sanity check). */
  cells: number;
  updatedAt: number;
}

type Store = Record<string, StoredProject>;

/** SHA-256 of the file bytes, truncated to 16 hex chars. */
export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Progress key for a hashed source + geometry. Geometry is appended
 * readable so debugging localStorage by eye stays possible.
 */
export function buildProgressKey(
  fileHash: string,
  gridW: number,
  gridH: number,
  tileSize: number,
): string {
  return `${fileHash}:${gridW}x${gridH}:${tileSize}`;
}

function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store: Store): void {
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_PROJECTS) {
      keys
        .sort((a, b) => store[b]!.updatedAt - store[a]!.updatedAt)
        .slice(MAX_PROJECTS)
        .forEach((k) => delete store[k]);
    }
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota/private mode; progress just won't persist.
  }
}

function bitsetToBase64(bits: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bits.length; i++) bin += String.fromCharCode(bits[i]!);
  return btoa(bin);
}

function base64ToBitset(s: string, byteLen: number): Uint8Array {
  try {
    const bin = atob(s);
    if (bin.length !== byteLen) return new Uint8Array(byteLen);
    const out = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(byteLen);
  }
}

export function getBit(bits: Uint8Array, i: number): boolean {
  return (bits[i >> 3]! & (1 << (i & 7))) !== 0;
}

function setBit(bits: Uint8Array, i: number, on: boolean): void {
  if (on) bits[i >> 3]! |= 1 << (i & 7);
  else bits[i >> 3]! &= ~(1 << (i & 7));
}

/** Count set bits in [start, end). */
export function countBits(
  bits: Uint8Array,
  start: number,
  end: number,
): number {
  let n = 0;
  for (let i = start; i < end; i++) if (getBit(bits, i)) n++;
  return n;
}

export interface PaintProgress {
  /** One bit per cell, global order: tileIndex*cellsPerTile + cellIndex. */
  bits: Uint8Array;
  /** Total marked cells. */
  done: number;
  /** Force one cell to a specific state (click and drag painting). */
  setCell: (globalIndex: number, on: boolean) => void;
  /** Mark or clear a whole tile. */
  setTile: (tileIndex: number, on: boolean) => void;
  /** Wipe all progress for this project. */
  reset: () => void;
}

/**
 * Hook owning the paint-progress bitset for one project key. `cells` is
 * the total cell count (gridW*gridH*tileSize^2); `cellsPerTile` sizes the
 * per-tile operations. Passing key=null (image hash not ready) returns an
 * inert tracker that isn't persisted.
 */
export function usePaintProgress(
  key: string | null,
  cells: number,
  cellsPerTile: number,
): PaintProgress {
  const byteLen = Math.ceil(cells / 8);
  const [bits, setBits] = useState<Uint8Array>(() => new Uint8Array(byteLen));
  const [done, setDone] = useState(0);
  // Mirror of the latest bitset for synchronous mutation chains and the
  // debounced/flushed saves. Only written in effects and callbacks (the
  // React Compiler rejects render-time ref writes).
  const bitsRef = useRef(bits);
  const saveTimer = useRef<number | null>(null);
  // Set while a save is pending; carries what to write on flush.
  const pendingRef = useRef<{ key: string; cells: number } | null>(null);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const store = loadStore();
    store[pending.key] = {
      bits: bitsetToBase64(bitsRef.current),
      cells: pending.cells,
      updatedAt: Date.now(),
    };
    saveStore(store);
  }, []);

  // (Re)load whenever the project key or geometry changes; flush any
  // pending write for the previous key first (cleanup runs before the
  // next effect body).
  useEffect(() => {
    const store = key ? loadStore() : null;
    const entry = key ? store?.[key] : undefined;
    const loaded =
      entry && entry.cells === cells
        ? base64ToBitset(entry.bits, byteLen)
        : new Uint8Array(byteLen);
    bitsRef.current = loaded;
    /* eslint-disable react-hooks/set-state-in-effect */
    setBits(loaded);
    setDone(countBits(loaded, 0, cells));
    /* eslint-enable react-hooks/set-state-in-effect */
    return flush;
  }, [key, cells, byteLen, flush]);

  const scheduleSave = useCallback(() => {
    if (!key) return;
    pendingRef.current = { key, cells };
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [key, cells, flush]);

  // Apply a mutation. Runs outside the state updater (updaters must be
  // pure; StrictMode double-invokes them) and chains through bitsRef so
  // rapid successive calls between renders see each other's writes.
  const mutate = useCallback(
    (fn: (next: Uint8Array) => number) => {
      const next = bitsRef.current.slice();
      const delta = fn(next);
      bitsRef.current = next;
      setBits(next);
      if (delta !== 0) setDone((d) => d + delta);
      scheduleSave();
    },
    [scheduleSave],
  );

  const setCell = useCallback(
    (i: number, on: boolean) => {
      if (i < 0 || i >= cells) return;
      mutate((next) => {
        if (getBit(next, i) === on) return 0;
        setBit(next, i, on);
        return on ? 1 : -1;
      });
    },
    [mutate, cells],
  );

  const setTile = useCallback(
    (tileIndex: number, on: boolean) => {
      mutate((next) => {
        const start = tileIndex * cellsPerTile;
        const end = Math.min(start + cellsPerTile, cells);
        let delta = 0;
        for (let i = start; i < end; i++) {
          if (getBit(next, i) !== on) {
            setBit(next, i, on);
            delta += on ? 1 : -1;
          }
        }
        return delta;
      });
    },
    [mutate, cellsPerTile, cells],
  );

  const reset = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingRef.current = null;
    bitsRef.current = new Uint8Array(byteLen);
    setBits(bitsRef.current);
    setDone(0);
    if (key) {
      const store = loadStore();
      delete store[key];
      saveStore(store);
    }
  }, [key, byteLen]);

  return useMemo(
    () => ({ bits, done, setCell, setTile, reset }),
    [bits, done, setCell, setTile, reset],
  );
}
