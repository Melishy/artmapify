"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { buildArtMapJson } from "@/components/artmap-export";
import { Button } from "@/components/ui/button";
import type { PipelineResult } from "@/lib/pipeline";
import {
  canvasToBlob,
  renderCanvasImage,
  renderPreviewCanvas,
  renderTileCanvas,
} from "@/lib/render";
import type { RenderOptions } from "@/lib/types";
import { fileBaseName } from "@/lib/utils";

interface Props {
  result: PipelineResult;
  itemTextures: Map<string, ImageBitmap>;
  fileName: string;
  /** Title for the bundled ArtMap export. Empty = skip the JSON. */
  artmapTitle: string;
  /** Artist UUID or name. Empty = random UUID, but only used when title is set. */
  artmapArtist: string;
}

export function DownloadZip({
  result,
  itemTextures,
  fileName,
  artmapTitle,
  artmapArtist,
}: Props) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const { tiles, settings, summary } = result;

      // preview.png
      const preview = renderPreviewCanvas(
        tiles,
        settings.gridW,
        settings.gridH,
        settings.tileSize,
        settings.previewScale,
      );
      zip.file("preview.png", await canvasToBlob(preview));

      // Per-tile guides.
      if (settings.guide) {
        for (let i = 0; i < tiles.length; i++) {
          const t = tiles[i]!;
          const tileOpts: RenderOptions = {
            cellSize: settings.cellSize,
            itemTextures,
            texturePadding: settings.texturePadding,
            tileBorder: settings.tileBorder,
            cellBorder: settings.cellBorder,
            rulerMargin: settings.rulerMargin,
            tileIndex: i + 1,
            tileTotal: tiles.length,
            outlineRuns: true,
          };
          const canvas = renderTileCanvas(t, settings.tileSize, tileOpts);
          const name = `map_${t.gx}_${t.gy}.png`;
          zip.file(name, await canvasToBlob(canvas));
        }
      }

      // Combined canvas.
      if (settings.guide && settings.combined) {
        const opts: RenderOptions = {
          cellSize: settings.cellSize,
          itemTextures,
          texturePadding: settings.texturePadding,
          tileBorder: settings.tileBorder,
          cellBorder: settings.cellBorder,
          rulerMargin: 0,
          outlineRuns: true,
        };
        const canvas = renderCanvasImage(
          tiles,
          settings.gridW,
          settings.gridH,
          settings.tileSize,
          opts,
        );
        zip.file("canvas.png", await canvasToBlob(canvas));
      }

      // summary.json
      const summaryJson = {
        source: fileName,
        settings,
        summary,
      };
      zip.file("summary.json", JSON.stringify(summaryJson, null, 2));

      // ArtMap import JSON (only when the user filled in a title).
      if (artmapTitle.trim()) {
        const artmapJson = await buildArtMapJson(
          result,
          fileName,
          artmapTitle,
          artmapArtist,
        );
        zip.file("artmap.json", artmapJson);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBaseName(fileName, "artmapify")}-artmapify.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={onClick} disabled={busy} size="sm">
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      Download zip
    </Button>
  );
}
