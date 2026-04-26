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
      <div className="flex aspect-square items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        No preview yet
      </div>
    );
  }
  return (
    <CanvasView
      source={canvas}
      className="w-full h-auto rounded-md border bg-black"
      alt="Preview"
    />
  );
}
