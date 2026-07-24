// Vanilla Minecraft `map_N.dat` export. No plugin required: drop the
// files into `<world>/data/` and give players filled maps with matching
// ids. Works on vanilla, Spigot/Paper, and Fabric servers alike.
//
// A map .dat is a gzipped NBT compound:
//
//   "" (compound)
//     DataVersion: int
//     data (compound)
//       scale: byte              0 = 1:1, the only scale that makes sense here
//       dimension: string        "minecraft:overworld" (string since 1.16)
//       trackingPosition: byte   0 = no position marker
//       unlimitedTracking: byte  0
//       locked: byte             1 = never redraw from terrain
//       xCenter, zCenter: int    irrelevant for locked maps; kept far away
//       banners: list (empty)
//       frames: list (empty)
//       colors: byte[16384]      128x128 row-major map color bytes
//
// The colors array is exactly the "unfolded" 128x128 buffer the ArtMap
// export already computes (each 32x32 cell replicated 4x4), so both
// exports share tileToUnfoldedBytes.
//
// DataVersion is pinned to 1.16.5 (2586): servers newer than that
// upgrade old data automatically via DataFixerUpper, and 1.16 is the
// first version with the string dimension tag we write. Older servers
// (1.13-1.15) are not supported by this export.

import pako from "pako";
import type { Tile } from "./types.ts";
import { tileToUnfoldedBytes } from "./artmap-export.ts";

/** 1.16.5. See file-level docstring for why this version. */
export const VANILLA_MAP_DATA_VERSION = 2586;

export interface VanillaMapExport {
  /** File name, e.g. "map_12.dat". */
  fileName: string;
  /** Map id (the N in map_N.dat and in /give's map component). */
  mapId: number;
  /** Grid position of the source tile (1-based). */
  gx: number;
  gy: number;
  /** Gzipped NBT, ready to write to disk. */
  data: Uint8Array;
}

export interface ExportVanillaOptions {
  /**
   * Id of the first map file. Tiles are numbered row-major from this.
   * Must not collide with maps that already exist on the server; see
   * idcounts.dat in the server's world data for the current counter.
   */
  firstMapId: number;
}

/** Minimal big-endian NBT writer, just enough for map_N.dat. */
class NbtWriter {
  private buf = new Uint8Array(1024);
  private len = 0;

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  short(v: number): void {
    this.ensure(2);
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  int(v: number): void {
    this.ensure(4);
    this.buf[this.len++] = (v >>> 24) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  /**
   * NBT string: unsigned short byte length + modified UTF-8. Everything
   * we write is ASCII, where modified UTF-8 and UTF-8 agree.
   */
  string(s: string): void {
    this.short(s.length);
    this.ensure(s.length);
    for (let i = 0; i < s.length; i++) {
      this.buf[this.len++] = s.charCodeAt(i) & 0x7f;
    }
  }

  bytes(v: Uint8Array): void {
    this.ensure(v.length);
    this.buf.set(v, this.len);
    this.len += v.length;
  }

  /** Tag header: tag id + name. */
  tag(id: number, name: string): void {
    this.byte(id);
    this.string(name);
  }

  done(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_INT = 3;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;

/**
 * Serialize one tile as uncompressed map_N.dat NBT. Exposed for tests;
 * use exportVanillaMaps for the gzipped files.
 */
export function tileToVanillaNbt(tile: Tile, tileSize: number): Uint8Array {
  const colors = tileToUnfoldedBytes(tile, tileSize);
  const w = new NbtWriter();

  // Root compound with empty name.
  w.tag(TAG_COMPOUND, "");

  w.tag(TAG_INT, "DataVersion");
  w.int(VANILLA_MAP_DATA_VERSION);

  w.tag(TAG_COMPOUND, "data");
  {
    w.tag(TAG_BYTE, "scale");
    w.byte(0);
    w.tag(TAG_STRING, "dimension");
    w.string("minecraft:overworld");
    w.tag(TAG_BYTE, "trackingPosition");
    w.byte(0);
    w.tag(TAG_BYTE, "unlimitedTracking");
    w.byte(0);
    w.tag(TAG_BYTE, "locked");
    w.byte(1);
    // Locked maps never redraw, but park the center far outside any
    // reasonable build so a future unlock doesn't overwrite the art
    // with local terrain.
    w.tag(TAG_INT, "xCenter");
    w.int(30000000);
    w.tag(TAG_INT, "zCenter");
    w.int(30000000);
    // Empty lists: element tag id TAG_END + length 0 is the canonical
    // encoding for an empty NBT list.
    w.tag(TAG_LIST, "banners");
    w.byte(TAG_END);
    w.int(0);
    w.tag(TAG_LIST, "frames");
    w.byte(TAG_END);
    w.int(0);
    w.tag(TAG_BYTE_ARRAY, "colors");
    w.int(colors.length);
    w.bytes(colors);
  }
  w.byte(TAG_END); // close "data"

  w.byte(TAG_END); // close root

  return w.done();
}

/**
 * Export every tile as a gzipped vanilla map file, numbered row-major
 * starting at `firstMapId`. Tiles must be 32x32 (the same constraint as
 * the ArtMap export; both unfold to 128x128).
 */
export function exportVanillaMaps(
  tiles: Tile[],
  tileSize: number,
  opts: ExportVanillaOptions,
): VanillaMapExport[] {
  const first = Math.floor(opts.firstMapId);
  if (!Number.isFinite(first) || first < 0) {
    throw new Error(
      `firstMapId must be a non-negative integer (got ${opts.firstMapId}).`,
    );
  }
  return tiles.map((tile, i) => {
    const mapId = first + i;
    const nbt = tileToVanillaNbt(tile, tileSize);
    return {
      fileName: `map_${mapId}.dat`,
      mapId,
      gx: tile.gx,
      gy: tile.gy,
      data: pako.gzip(nbt),
    };
  });
}
