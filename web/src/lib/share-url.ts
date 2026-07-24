// Shareable settings links. The full PipelineSettings (plus aspectAuto)
// is JSON-encoded, base64url'd, and carried in the URL hash:
//
//   https://host/path#s=eyJ2IjoxLCJzZXR0aW5ncyI6ey4uLn19
//
// The hash (not a query param) keeps the payload out of server logs and
// avoids any interaction with Next's routing. On load the hash is applied
// over the visitor's cached settings, then stripped from the address bar
// so a reload doesn't keep re-applying it.
//
// Decoding is defensive: every field is validated/coerced against known
// enums and numeric ranges, unknown keys are dropped, and any parse
// failure returns null so a mangled link degrades to "nothing happens".

import {
  DEFAULT_ADJUSTMENTS,
  type Adjustments,
  type PipelineSettings,
} from "./types";

const HASH_PREFIX = "#s=";
const VERSION = 1;

export interface SharedState {
  settings: PipelineSettings;
  aspectAuto: boolean;
}

interface SharePayload {
  v: number;
  settings: PipelineSettings;
  aspectAuto: boolean;
}

/** Build the value for window.location.hash (includes the leading #). */
export function encodeShareHash(state: SharedState): string {
  const payload: SharePayload = {
    v: VERSION,
    settings: state.settings,
    aspectAuto: state.aspectAuto,
  };
  return HASH_PREFIX + base64UrlEncode(JSON.stringify(payload));
}

/** Full absolute share URL for the current page. */
export function buildShareUrl(state: SharedState): string {
  const base = window.location.href.split("#")[0]!;
  return base + encodeShareHash(state);
}

/**
 * Parse a location hash. Returns null unless the hash carries a valid
 * versioned payload. The returned settings are sanitized field-by-field
 * against `defaults` (unknown/invalid fields fall back to the default).
 */
export function decodeShareHash(
  hash: string,
  defaults: PipelineSettings,
): SharedState | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    const json = base64UrlDecode(hash.slice(HASH_PREFIX.length));
    const raw = JSON.parse(json) as Partial<SharePayload> | null;
    if (!raw || typeof raw !== "object" || raw.v !== VERSION) return null;
    if (!raw.settings || typeof raw.settings !== "object") return null;
    return {
      settings: sanitizeSettings(raw.settings, defaults),
      aspectAuto: raw.aspectAuto === true,
    };
  } catch {
    return null;
  }
}

const DITHERS = new Set(["none", "floyd-steinberg", "burkes", "sierra-lite"]);
const METRICS = new Set(["luma-hue", "redmean", "rgb"]);
const FITS = new Set(["contain", "cover", "fill"]);
const FILTERS = new Set(["none", "grayscale", "sepia"]);

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(v, fallback, min, max));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function oneOf<T extends string>(v: unknown, set: Set<string>, fallback: T): T {
  return typeof v === "string" && set.has(v) ? (v as T) : fallback;
}

function sanitizeSettings(
  raw: Partial<PipelineSettings>,
  d: PipelineSettings,
): PipelineSettings {
  const a = (raw.adjustments ?? {}) as Partial<Adjustments>;
  const excludedBases = Array.isArray(raw.excludedBases)
    ? raw.excludedBases
        .filter((b): b is string => typeof b === "string")
        .slice(0, 256)
    : d.excludedBases;
  return {
    gridW: int(raw.gridW, d.gridW, 1, 128),
    gridH: int(raw.gridH, d.gridH, 1, 128),
    tileSize: int(raw.tileSize, d.tileSize, 4, 64),
    cellSize: int(raw.cellSize, d.cellSize, 8, 128),
    previewScale: int(raw.previewScale, d.previewScale, 1, 16),
    texturePadding: num(raw.texturePadding, d.texturePadding, 0, 0.45),
    tileBorder: int(raw.tileBorder, d.tileBorder, 0, 10),
    cellBorder: int(raw.cellBorder, d.cellBorder, 0, 10),
    rulerMargin: int(raw.rulerMargin, d.rulerMargin, 0, 80),
    dither: oneOf(raw.dither, DITHERS, d.dither),
    metric: oneOf(raw.metric, METRICS, d.metric),
    clickBias: num(raw.clickBias, d.clickBias, 0, 32),
    gammaDither: bool(raw.gammaDither, d.gammaDither),
    fit: oneOf(raw.fit, FITS, d.fit),
    adjustments: {
      brightness: num(a.brightness, DEFAULT_ADJUSTMENTS.brightness, 0.2, 2),
      contrast: num(a.contrast, DEFAULT_ADJUSTMENTS.contrast, 0.2, 2),
      saturation: num(a.saturation, DEFAULT_ADJUSTMENTS.saturation, 0, 2),
      sharpness: num(a.sharpness, DEFAULT_ADJUSTMENTS.sharpness, 0.3, 2),
      filter: oneOf(a.filter, FILTERS, DEFAULT_ADJUSTMENTS.filter),
    },
    guide: bool(raw.guide, d.guide),
    combined: bool(raw.combined, d.combined),
    excludedBases,
  };
}

// base64url without padding; handles Unicode via UTF-8 bytes.
function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
