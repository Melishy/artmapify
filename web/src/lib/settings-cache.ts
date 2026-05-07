// Persists the user's last-used settings to localStorage so reloads pick
// up where they left off. Companion to source-cache.ts (which handles the
// uploaded image in IndexedDB).
//
// Why localStorage and not IndexedDB? Settings are <1 KB of JSON, the
// reads are synchronous, and we need them on the very first render so
// the controls don't flash defaults before the cache resolves. The
// trade-off: localStorage is sync, so we wrap reads in try/catch and
// silently fall back to defaults if anything is malformed (e.g. cached
// data from an older settings shape).

import type { PipelineSettings } from "./types";

const KEY = "artmapify:settings:v1";

interface CachedSettings {
  settings: PipelineSettings;
  aspectAuto: boolean;
  artmapTitle: string;
  artmapArtist: string;
}

export type CachedSettingsPartial = Partial<CachedSettings>;

/**
 * Read the last persisted settings. Returns an empty object on cache
 * miss, malformed JSON, or storage unavailable. The caller merges the
 * partial result onto their defaults.
 */
export function loadCachedSettings(): CachedSettingsPartial {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CachedSettingsPartial;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Persist the current settings snapshot. Best-effort - quota or private-
 * mode failures are swallowed so they never break the UI.
 */
export function saveCachedSettings(snapshot: CachedSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage disabled or full; ignore.
  }
}
