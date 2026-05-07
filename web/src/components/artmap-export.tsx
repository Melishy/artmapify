"use client";

import { Download, Info, Loader2 } from "lucide-react";
import { useState } from "react";
import { DEFAULT_SUFFIX_TEMPLATE, exportArtMap, isUuid } from "@artmapify/core";
import { ArtMapImportInstructions } from "@/components/artmap-import-instructions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PipelineResult } from "@/lib/pipeline";
import { fileBaseName } from "@/lib/utils";

interface Props {
  result: PipelineResult;
  fileName: string;
  /** Title bound to page-level state. */
  title: string;
  onTitleChange: (next: string) => void;
  /** Artist (UUID or player name) bound to page-level state. */
  artist: string;
  onArtistChange: (next: string) => void;
  /**
   * Per-tile suffix template. Empty string disables the suffix.
   * Supports {row}, {col}, {count} placeholders.
   */
  suffixTemplate: string;
  onSuffixTemplateChange: (next: string) => void;
}

/**
 * UI block for the ArtMap import-JSON download. Title + artist inputs
 * mirror the CLI's --title / --artist flags. The actual export logic
 * (gzip + base64 + Java hashCode) lives in @artmapify/core so the CLI
 * and web ports produce byte-identical rows.
 */
export function ArtMapExport(props: Props) {
  const {
    result,
    fileName,
    title,
    onTitleChange,
    artist,
    onArtistChange,
    suffixTemplate,
    onSuffixTemplateChange,
  } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const isMultiTile = result.settings.gridW * result.settings.gridH > 1;

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = await buildArtMapJson(
        result,
        fileName,
        title,
        artist,
        suffixTemplate,
      );
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBaseName(fileName)}-artmap.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="artmap-title" className="text-xs">
            ArtMap title
          </Label>
          <Input
            id="artmap-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={fileBaseName(fileName) || "Untitled"}
            maxLength={16}
          />
          <p className="text-muted-foreground text-[10px]">
            3-16 chars. Multi-tile grids append the suffix below.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="artmap-artist" className="text-xs">
            Artist (UUID or player name)
          </Label>
          <Input
            id="artmap-artist"
            value={artist}
            onChange={(e) => onArtistChange(e.target.value)}
            placeholder="random UUID"
          />
          <p className="text-muted-foreground text-[10px]">
            Names get the offline-mode UUID Bukkit assigns. Empty = random.
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="artmap-suffix" className="text-xs">
            Per-tile suffix
          </Label>
          <Input
            id="artmap-suffix"
            value={suffixTemplate}
            onChange={(e) => onSuffixTemplateChange(e.target.value)}
            placeholder={DEFAULT_SUFFIX_TEMPLATE}
            disabled={!isMultiTile}
          />
          <p className="text-muted-foreground text-[10px]">
            Placeholders:{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono">
              {"{row}"}
            </code>{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono">
              {"{col}"}
            </code>{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono">
              {"{count}"}
            </code>
            . Leave empty for no suffix (only useful on 1×1 grids).
            {!isMultiTile && " Disabled because the grid is 1x1."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onClick} disabled={busy} size="sm">
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          ArtMap JSON
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowInstructions(true)}
        >
          <Info />
          How to import
        </Button>
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <ArtMapImportInstructions
        open={showInstructions}
        onOpenChange={setShowInstructions}
        fileName={`${fileBaseName(fileName)}-artmap.json`}
      />
    </div>
  );
}

/**
 * Build the JSON string for the export. Exposed here (not just inside
 * the click handler) so download-zip can reuse it.
 */
export async function buildArtMapJson(
  result: PipelineResult,
  fileName: string,
  title: string,
  artist: string,
  suffixTemplate: string,
): Promise<string> {
  const resolvedTitle = title.trim() || fileBaseName(fileName) || "Untitled";
  const resolvedArtist = await resolveArtist(artist);
  const rows = exportArtMap(
    result.tiles,
    result.settings.tileSize,
    result.settings.gridW,
    result.settings.gridH,
    {
      title: resolvedTitle,
      artist: resolvedArtist,
      suffixTemplate,
      // Date defaults to today in @artmapify/core.
    },
  );
  return JSON.stringify(rows, null, 2);
}

/**
 * Convert the artist input into a UUID. Mirrors the CLI's resolveArtist:
 *   - already a UUID -> use as-is
 *   - non-empty name -> Bukkit offline UUID via MD5("OfflinePlayer:<name>")
 *   - empty          -> random v4 UUID
 *
 * Browsers don't expose MD5 via WebCrypto, so for the offline-name case we
 * implement MD5 manually (small, stable, public domain).
 */
async function resolveArtist(raw: string): Promise<string> {
  const s = raw.trim();
  if (!s) return crypto.randomUUID();
  if (isUuid(s)) return s;
  // Bukkit offline UUID = UUIDv3 over MD5("OfflinePlayer:<name>").
  const enc = new TextEncoder();
  const bytes = enc.encode("OfflinePlayer:" + s);
  const digest = md5(bytes);
  digest[6] = (digest[6]! & 0x0f) | 0x30;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const h = Array.from(digest.slice(0, 16), hex).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// --- MD5, public domain. ---
// Standalone MD5 for the offline-UUID derivation. Java's UUID.nameUUIDFromBytes
// is MD5-based (UUIDv3) and WebCrypto explicitly excludes MD5, so we ship
// our own. ~50 lines, no allocations after init.
function md5(input: Uint8Array): Uint8Array {
  const len = input.length;
  const totalLen = (((len + 8) >>> 6) + 1) * 64;
  const buf = new Uint8Array(totalLen);
  buf.set(input);
  buf[len] = 0x80;
  const bitLenLo = (len * 8) | 0;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const dv = new DataView(buf.buffer);
  dv.setUint32(totalLen - 8, bitLenLo, true);
  dv.setUint32(totalLen - 4, bitLenHi, true);

  let a = 0x67452301 | 0;
  let b = 0xefcdab89 | 0;
  let c = 0x98badcfe | 0;
  let d = 0x10325476 | 0;

  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];

  const M = new Int32Array(16);
  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getInt32(off + i * 4, true);
    let A = a,
      B = b,
      C = c,
      D = d;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const tmp = D;
      D = C;
      C = B;
      const x = (A + F + K[i]! + M[g]!) | 0;
      const s = S[i]!;
      B = (B + ((x << s) | (x >>> (32 - s)))) | 0;
      A = tmp;
    }
    a = (a + A) | 0;
    b = (b + B) | 0;
    c = (c + C) | 0;
    d = (d + D) | 0;
  }

  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a, true);
  odv.setUint32(4, b, true);
  odv.setUint32(8, c, true);
  odv.setUint32(12, d, true);
  return out;
}
