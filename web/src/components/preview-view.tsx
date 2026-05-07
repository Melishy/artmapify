"use client";

import { useMemo } from "react";
import { CanvasView } from "./canvas-view";
import { renderPreviewCanvas } from "@/lib/render";
import type { Tile } from "@/lib/types";

interface Props {
  tiles: Tile[] | null;
  gridW: number;
  gridH: number;
  tileSize: number;
  scale: number;
}

export function PreviewView({ tiles, gridW, gridH, tileSize, scale }: Props) {
  const canvas = useMemo(() => {
    if (!tiles) return null;
    return renderPreviewCanvas(tiles, gridW, gridH, tileSize, scale);
  }, [tiles, gridW, gridH, tileSize, scale]);

  if (!canvas) {
    return (
      <div className="bg-muted/30 text-muted-foreground flex aspect-square items-center justify-center rounded-md border text-sm">
        No preview yet
      </div>
    );
  }
  return (
    <CanvasView
      source={canvas}
      className="h-auto w-full rounded-md border bg-black"
      alt="Preview"
    />
  );
}
