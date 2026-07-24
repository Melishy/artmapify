"use client";

import { useEffect, useRef } from "react";
import { CanvasView } from "./canvas-view";
import { getBit } from "@/lib/paint-progress";
import type { AnyCanvas } from "@/lib/render";

/** Ruler crosshair position (cell coordinates within the tile). */
export interface Crosshair {
  x: number;
  y: number;
}

interface Props {
  /** The rendered guide canvas the overlay sits on. */
  guideCanvas: AnyCanvas;
  /** Cells per tile edge (settings.tileSize). */
  tileSize: number;
  /** Guide pixel size of one cell (settings.cellSize). */
  cellSize: number;
  /** Guide ruler margin (top + left offset of cell (0,0)). */
  rulerMargin: number;
  /** Global progress bitset. */
  bits: Uint8Array;
  /** Global bit index of this tile's cell (0,0). */
  baseIndex: number;
  /** Whether clicks/drags paint. When false the overlay is display-only. */
  paintMode: boolean;
  /** Set one cell (index within this tile) to done/not-done. */
  onPaintCell: (cellIndex: number, on: boolean) => void;
  /** Whether clicks move the ruler crosshair. Exclusive with paintMode. */
  rulerMode: boolean;
  /** Current crosshair, or null when unset. */
  crosshair: Crosshair | null;
  onCrosshairChange: (next: Crosshair | null) => void;
  alt?: string;
}

/**
 * Guide canvas + progress/ruler overlay stack. Everything is drawn on a
 * second canvas so overlay updates never re-run the expensive guide
 * render underneath.
 *
 * Paint mode: click toggles a cell and dragging paints; the first cell
 * touched decides whether the stroke marks or unmarks, so sweeping
 * across a painted row doesn't flicker cells back and forth.
 *
 * Ruler mode: click a cell to pin a crosshair on its row + column and
 * dim everything else (like sliding a ruler across a printed pattern).
 * Clicking the pinned cell again clears it; dragging moves the
 * crosshair. Clicks on the number margins are ignored, only cells
 * inside the grid count.
 */
export function PaintOverlay({
  guideCanvas,
  tileSize,
  cellSize,
  rulerMargin,
  bits,
  baseIndex,
  paintMode,
  onPaintCell,
  rulerMode,
  crosshair,
  onCrosshairChange,
  alt,
}: Props) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // Drag stroke state. null = no active stroke.
  const strokeRef = useRef<{ on: boolean; last: number } | null>(null);
  // True while a ruler drag is active.
  const rulerDragRef = useRef(false);

  const margin = Math.max(0, Math.floor(rulerMargin));
  const interactive = paintMode || rulerMode;

  // Redraw whenever progress, the crosshair, or the guide changes.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    el.width = guideCanvas.width;
    el.height = guideCanvas.height;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);

    const area = tileSize * cellSize;

    // Ruler crosshair first, so paint marks stay visible on top of the
    // dimmed regions.
    if (crosshair) {
      // Dim the whole cell area, then punch the active bands back out.
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(margin, margin, area, area);
      ctx.clearRect(margin, margin + crosshair.y * cellSize, area, cellSize);
      ctx.clearRect(margin + crosshair.x * cellSize, margin, cellSize, area);
      // Band outlines.
      ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
      ctx.lineWidth = Math.max(2, cellSize / 10);
      ctx.strokeRect(margin, margin + crosshair.y * cellSize, area, cellSize);
      ctx.strokeRect(margin + crosshair.x * cellSize, margin, cellSize, area);
      // Intersection pops brightest.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.strokeRect(
        margin + crosshair.x * cellSize,
        margin + crosshair.y * cellSize,
        cellSize,
        cellSize,
      );
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = Math.max(1.5, cellSize / 12);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const drawCheck = cellSize >= 14;

    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const idx = y * tileSize + x;
        if (!getBit(bits, baseIndex + idx)) continue;
        const px = margin + x * cellSize;
        const py = margin + y * cellSize;
        // Black out the finished cell so the remaining work pops.
        ctx.fillRect(px, py, cellSize, cellSize);
        if (drawCheck) {
          const s = cellSize;
          ctx.beginPath();
          ctx.moveTo(px + s * 0.24, py + s * 0.52);
          ctx.lineTo(px + s * 0.42, py + s * 0.72);
          ctx.lineTo(px + s * 0.78, py + s * 0.28);
          ctx.stroke();
        }
      }
    }
  }, [guideCanvas, bits, baseIndex, tileSize, cellSize, margin, crosshair]);

  /**
   * Resolve a pointer event to cell coordinates, or null when the
   * pointer is outside the cell grid (including the number margins).
   */
  const gridPos = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): { cx: number; cy: number } | null => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    // The canvas is CSS-scaled; map back to guide pixel space first.
    const px = ((e.clientX - rect.left) / rect.width) * el.width;
    const py = ((e.clientY - rect.top) / rect.height) * el.height;
    const cx = Math.floor((px - margin) / cellSize);
    const cy = Math.floor((py - margin) / cellSize);
    if (cx < 0 || cy < 0 || cx >= tileSize || cy >= tileSize) return null;
    return { cx, cy };
  };

  const cellAt = (e: React.PointerEvent<HTMLCanvasElement>): number | null => {
    const pos = gridPos(e);
    if (!pos) return null;
    return pos.cy * tileSize + pos.cx;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (rulerMode) {
      const pos = gridPos(e);
      if (!pos) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      rulerDragRef.current = true;
      // Clicking the already-pinned cell clears the ruler.
      if (crosshair && pos.cx === crosshair.x && pos.cy === crosshair.y) {
        onCrosshairChange(null);
        rulerDragRef.current = false;
        return;
      }
      onCrosshairChange({ x: pos.cx, y: pos.cy });
      return;
    }
    if (!paintMode) return;
    const idx = cellAt(e);
    if (idx === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // First cell decides the stroke direction: mark if it was unmarked.
    const on = !getBit(bits, baseIndex + idx);
    strokeRef.current = { on, last: idx };
    onPaintCell(idx, on);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (rulerDragRef.current) {
      const pos = gridPos(e);
      if (!pos) return;
      if (!crosshair || pos.cx !== crosshair.x || pos.cy !== crosshair.y) {
        onCrosshairChange({ x: pos.cx, y: pos.cy });
      }
      return;
    }
    const stroke = strokeRef.current;
    if (!stroke) return;
    const idx = cellAt(e);
    if (idx === null || idx === stroke.last) return;
    stroke.last = idx;
    onPaintCell(idx, stroke.on);
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (strokeRef.current || rulerDragRef.current) {
      strokeRef.current = null;
      rulerDragRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="relative inline-block">
      <CanvasView
        source={guideCanvas}
        className="block h-auto max-w-full"
        alt={alt}
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full"
        style={{
          imageRendering: "pixelated",
          // In paint/ruler mode the overlay eats pointer input
          // (touch-action none so touch drags act instead of scrolling);
          // otherwise it's a transparent display layer.
          pointerEvents: interactive ? "auto" : "none",
          touchAction: interactive ? "none" : undefined,
          cursor: interactive ? "crosshair" : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        aria-hidden
      />
    </div>
  );
}
