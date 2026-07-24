"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { exportVanillaMaps } from "@artmapify/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PipelineResult } from "@/lib/pipeline";
import { fileBaseName } from "@/lib/utils";

interface Props {
  result: PipelineResult;
  fileName: string;
}

/**
 * Vanilla `map_N.dat` export. Unlike the ArtMap JSON this needs no plugin:
 * the files go straight into `<world>/data/` and players get the art as
 * filled maps. The NBT/gzip logic lives in @artmapify/core.
 */
export function VanillaExport({ result, fileName }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstIdRaw, setFirstIdRaw] = useState("1000");

  const firstMapId = Number.parseInt(firstIdRaw, 10);
  const idValid = Number.isInteger(firstMapId) && firstMapId >= 0;
  const count = result.tiles.length;
  const lastMapId = idValid ? firstMapId + count - 1 : null;

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const maps = exportVanillaMaps(result.tiles, result.settings.tileSize, {
        firstMapId,
      });
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const m of maps) {
        zip.file(m.fileName, m.data);
      }
      zip.file("README.txt", buildReadme(maps, result));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBaseName(fileName)}-vanilla-maps.zip`;
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
          <Label htmlFor="vanilla-first-id" className="text-xs">
            First map id
          </Label>
          <Input
            id="vanilla-first-id"
            inputMode="numeric"
            value={firstIdRaw}
            onChange={(e) => setFirstIdRaw(e.target.value)}
            placeholder="1000"
          />
          <p className="text-muted-foreground text-[10px]">
            {idValid
              ? count === 1
                ? `Writes map_${firstMapId}.dat.`
                : `Writes map_${firstMapId}.dat through map_${lastMapId}.dat (${count} files).`
              : "Enter a non-negative integer."}{" "}
            Pick ids above the server&apos;s current map count so nothing gets
            overwritten.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onClick} disabled={busy || !idValid} size="sm">
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          Vanilla map .dat zip
        </Button>
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function buildReadme(
  maps: { fileName: string; mapId: number; gx: number; gy: number }[],
  result: PipelineResult,
): string {
  const { gridW, gridH } = result.settings;
  const first = maps[0]!.mapId;
  const last = maps[maps.length - 1]!.mapId;
  const giveLines = maps
    .map(
      (m) =>
        `/give @p minecraft:filled_map[minecraft:map_id=${m.mapId}]   (tile column ${m.gx}, row ${m.gy})`,
    )
    .join("\n");

  return `ArtMapify vanilla map export
============================

Files: ${maps.length} map file(s), ids ${first}..${last}, for a ${gridW}x${gridH} canvas.
Tiles are numbered row-major: left to right, then top to bottom.

Install
-------
1. Stop the server (or make sure the world is not loaded).
2. Copy the map_*.dat files into your world's data folder:
       <server>/<world>/data/
3. IMPORTANT: check <world>/data/idcounts.dat. If the server's map counter
   is below ${last}, newly crafted maps would eventually reuse these ids and
   overwrite your art. Either pick a first id well above the current count,
   or bump the counter in idcounts.dat to at least ${last + 1} with an NBT
   editor.
4. Start the server.

Get the maps in-game (1.20.5+ component syntax)
-----------------------------------------------
${giveLines}

On versions older than 1.20.5 use the legacy syntax instead, e.g.:
/give @p minecraft:filled_map{map:${first}}

Place item frames in a ${gridW} wide x ${gridH} tall grid and put each map in
its frame following the (column, row) noted above.

Notes
-----
- The files are written with DataVersion 2586 (1.16.5). Newer servers
  upgrade them automatically on load. Servers older than 1.16 are not
  supported.
- Maps are exported "locked", so they never redraw from terrain.
`;
}
