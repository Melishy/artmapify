// ArtMap (https://gitlab.com/BlockStack/ArtMap) database export.
//
// Each Minecraft map tile in our pipeline becomes one ArtMap row of the
// form:
//   { title, artist, date, mapData, hash }
// where:
//   - title       3..16 chars, unique per artwork in the ArtMap DB.
//   - artist      Player UUID. Online-mode UUIDs come from Mojang;
//                 offline-mode (cracked) UUIDs are derived from the
//                 player name as `UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).bytes)`,
//                 which Bukkit uses for offline players. Both shapes
//                 are accepted.
//   - date        "DD-MM-YYYY", matching ArtMap's SimpleDateFormat.
//   - mapData     Gzipped + base64 of the folded 32x32 byte grid.
//   - hash        Java Arrays.hashCode of the *unfolded* 128x128 byte
//                 array, signed int32.
//
// Format references:
//   - me.Fupery.ArtMap.IO.ColourMap.f32x32 (compress/unfold logic)
//   - me.Fupery.ArtMap.IO.CompressedMap     (hash + BLOB shape)
//   - me.Fupery.ArtMap.IO.MapArt            (title/artist/date semantics)
//   - me.Fupery.ArtMap.IO.Database.ArtTable (DB schema, "artworks" table)

import pako from "pako";
import type { PaletteEntry, Tile } from "./types.ts";
import { mcMapByte } from "./palette.ts";

export interface ArtMapTileExport {
  /** 3..16 chars. Truncated/padded if necessary by the caller. */
  title: string;
  /** UUID v4 string, formatted with dashes. */
  artist: string;
  /** "DD-MM-YYYY" matching ArtMap's SimpleDateFormat. */
  date: string;
  /** Gzip + base64 of the folded 32x32 byte grid. */
  mapData: string;
  /** Java Arrays.hashCode of the unfolded 128x128 byte array (signed int32). */
  hash: number;
}

export interface ExportArtMapOptions {
  /**
   * Title used as the base for every tile. Multi-tile grids append the
   * resolved `suffixTemplate` after this base.
   */
  title: string;
  /** Player UUID. See file-level docstring for the format. */
  artist: string;
  /**
   * Date in "DD-MM-YYYY". Defaults to today in UTC if omitted.
   */
  date?: string;
  /**
   * Per-tile suffix appended to `title` for multi-tile grids. Supports
   * three placeholders:
   *
   *   {row}    1-based grid row    (1..gridH)
   *   {col}    1-based grid column (1..gridW)
   *   {count}  1-based row-major tile index (1..gridW*gridH)
   *
   * Defaults to ` {count}`. Pass an empty string to disable
   * appending (the base title is used verbatim for every tile, which
   * only makes sense for 1x1 grids; the server will append `_1` etc.
   * for collisions).
   */
  suffixTemplate?: string;
  /**
   * Power-user escape hatch: full control over the per-tile title.
   * Wins over `suffixTemplate` when set. Must return a 3..16 char
   * string; the caller is responsible for length budgeting.
   */
  multiTileTitle?: (
    baseTitle: string,
    gx: number,
    gy: number,
    gridW: number,
    gridH: number,
  ) => string;
}

const ARTMAP_MIN_TITLE = 3;
const ARTMAP_MAX_TITLE = 16;
// Space-separated by default ("Art 1") since ArtMap accepts spaces in
// titles and the running tile count reads more naturally than a row/col
// pair. Power users can override via opts.suffixTemplate
// (e.g. " R{row}C{col}", " #{count}").
export const DEFAULT_SUFFIX_TEMPLATE = " {count}";

/**
 * Substitute {row}, {col}, {count} in a suffix template. Unknown
 * placeholders are left intact so users can include literal braces
 * by mistake without producing surprising output.
 */
function renderSuffix(
  template: string,
  row: number,
  col: number,
  count: number,
): string {
  return template
    .replace(/\{row\}/g, String(row))
    .replace(/\{col\}/g, String(col))
    .replace(/\{count\}/g, String(count));
}

/**
 * Worst-case rendered length of a suffix template for a given grid.
 * Used to reserve room when truncating long base titles.
 */
function maxSuffixLength(
  template: string,
  gridW: number,
  gridH: number,
): number {
  if (template === "") return 0;
  const total = gridW * gridH;
  // Pessimistically use the largest possible value of each placeholder.
  return renderSuffix(template, gridH, gridW, total).length;
}

/** Format today's date as DD-MM-YYYY (UTC). */
export function todayDDMMYYYY(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/**
 * Generate the offline-player UUID Bukkit assigns to a name when online
 * mode is off. This is `UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).bytes)`,
 * a name-based UUIDv3 over MD5("OfflinePlayer:<name>").
 *
 * Node-only. The web app implements MD5 inline so it can do the same
 * derivation client-side without bundling node:crypto.
 */
export async function offlinePlayerUuid(name: string): Promise<string> {
  const enc = new TextEncoder();
  const bytes = enc.encode("OfflinePlayer:" + name);
  const digest = await md5Digest(bytes);
  // Set version (3) and variant (RFC 4122) bits per UUIDv3 spec.
  digest[6] = (digest[6]! & 0x0f) | 0x30;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  return formatUuid(digest);
}

async function md5Digest(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const nodeCrypto = await import("node:crypto");
    const h = nodeCrypto.createHash("md5");
    h.update(bytes);
    return new Uint8Array(h.digest());
  } catch {
    throw new Error(
      "offlinePlayerUuid requires Node's crypto MD5; in the browser, generate the UUID client-side or pass a Mojang-issued one.",
    );
  }
}

function formatUuid(b: Uint8Array): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const s = Array.from(b.slice(0, 16), hex).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Quick sanity check that a string looks like a hyphen-separated UUID. */
export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/** Java byte[] Arrays.hashCode: result = 1; for b: result = 31*result + (signed b). */
function javaArraysHashCode(bytes: Uint8Array): number {
  let h = 1;
  for (let i = 0; i < bytes.length; i++) {
    // Sign-extend the byte to int32 the way Java does: a 0xFF byte becomes -1.
    const b = (bytes[i]! << 24) >> 24;
    h = (Math.imul(31, h) + b) | 0;
  }
  return h;
}

/**
 * Convert a Tile (32x32 cells) into a 128x128 byte array of Minecraft
 * map color bytes by replicating each cell into a 4x4 block.
 *
 * ArtMap's f32x32.unfoldMap uses the same "stretch a 32x32 grid into
 * 128x128 by 4x4 nearest-neighbor blocks" rule when reading the BLOB
 * back out, so the unfolded form we hash here is byte-for-byte the
 * same buffer ArtMap will reconstruct on the server side.
 */
function tileToUnfoldedBytes(tile: Tile, tileSize: number): Uint8Array {
  if (tileSize !== 32) {
    throw new Error(
      `ArtMap export requires tileSize === 32 (got ${tileSize}); ArtMap stores 32x32 grids unfolded to 128x128.`,
    );
  }
  const cells = tile.cells;
  const unfolded = new Uint8Array(128 * 128);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const cell = cells[y * 32 + x] as PaletteEntry | undefined;
      if (!cell) continue;
      const byte = mcMapByte(cell);
      // Replicate 4x4. Match f32x32.unfoldMap which fills a 4x4 block
      // for every source cell (px+ix, py+iy) with magnitude=4.
      const ix = x * 4;
      const iy = y * 4;
      for (let py = 0; py < 4; py++) {
        const row = (iy + py) * 128;
        for (let px = 0; px < 4; px++) {
          unfolded[row + ix + px] = byte;
        }
      }
    }
  }
  return unfolded;
}

/**
 * Fold a 128x128 unfolded byte array down to 32x32 by sampling pixel
 * (x*4, y*4). Mirrors f32x32.foldMap with magnitude=4. Returns a fresh
 * 1024-byte buffer ready for gzip.
 */
function foldUnfoldedBytes(unfolded: Uint8Array): Uint8Array {
  if (unfolded.length !== 128 * 128) {
    throw new Error(`Expected 128x128 (16384) bytes, got ${unfolded.length}.`);
  }
  const folded = new Uint8Array(32 * 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      folded[y * 32 + x] = unfolded[x * 4 + y * 4 * 128]!;
    }
  }
  return folded;
}

/** Standard base64 encode of a Uint8Array (no line wrapping). */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  // Browser fallback. btoa wants a binary string.
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).btoa(bin);
}

/**
 * Build the ArtMap row for one tile: gzip the folded 32x32 buffer, base64
 * encode it, and compute the hash on the unfolded 128x128 form.
 */
export function exportArtMapTile(
  tile: Tile,
  tileSize: number,
  meta: { title: string; artist: string; date: string },
): ArtMapTileExport {
  const unfolded = tileToUnfoldedBytes(tile, tileSize);
  const folded = foldUnfoldedBytes(unfolded);
  const compressed = pako.gzip(folded);
  const mapData = bytesToBase64(compressed);
  const hash = javaArraysHashCode(unfolded);
  return {
    title: clampTitle(meta.title),
    artist: meta.artist,
    date: meta.date,
    mapData,
    hash,
  };
}

/**
 * Build ArtMap rows for every tile in a grid. The artist UUID is the
 * same on every row; titles are derived per-tile by `multiTileTitle`
 * (or the default scheme) when there's more than one tile.
 */
export function exportArtMap(
  tiles: Tile[],
  tileSize: number,
  gridW: number,
  gridH: number,
  opts: ExportArtMapOptions,
): ArtMapTileExport[] {
  const date = opts.date ?? todayDDMMYYYY();
  // suffixTemplate="" means "no suffix". undefined falls back to default.
  const template = opts.suffixTemplate ?? DEFAULT_SUFFIX_TEMPLATE;
  // Reserve room for the longest rendered suffix in this grid so the
  // base title doesn't eat the suffix when it gets truncated to 16 chars.
  const suffixLen = maxSuffixLength(template, gridW, gridH);
  const baseRoom = Math.max(ARTMAP_MIN_TITLE, ARTMAP_MAX_TITLE - suffixLen);
  const trimmedBase = opts.title.trim().slice(0, baseRoom);
  const single = tiles.length === 1;

  // Default titler reads from the resolved template; power users can pass
  // their own multiTileTitle to override entirely.
  const titler =
    opts.multiTileTitle ??
    ((_base: string, gx: number, gy: number, gw: number) => {
      if (template === "") return clampTitle(trimmedBase);
      const count = (gy - 1) * gw + gx;
      return clampTitle(
        `${trimmedBase}${renderSuffix(template, gy, gx, count)}`,
      );
    });
  return tiles.map((tile) => {
    const title = single
      ? clampTitle(opts.title)
      : titler(opts.title, tile.gx, tile.gy, gridW, gridH);
    return exportArtMapTile(tile, tileSize, {
      title,
      artist: opts.artist,
      date,
    });
  });
}

function clampTitle(t: string): string {
  let s = t.trim();
  if (s.length < ARTMAP_MIN_TITLE) {
    // Pad short titles with underscores so ArtMap accepts them.
    s = (s + "___").slice(0, ARTMAP_MIN_TITLE);
  }
  if (s.length > ARTMAP_MAX_TITLE) s = s.slice(0, ARTMAP_MAX_TITLE);
  return s;
}
