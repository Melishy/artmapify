"use client";

import {
  Brush,
  Check,
  Eraser,
  Hand,
  Info,
  Loader2,
  RotateCcw,
  Ruler,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasView } from "./canvas-view";
import { PaintOverlay, type Crosshair } from "./paint-overlay";
import { PanContainer } from "./pan-container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { countBits, usePaintProgress } from "@/lib/paint-progress";
import type { AnyCanvas } from "@/lib/render";
import {
  renderPreviewCanvas,
  renderTileCanvas,
  sliceTileThumb,
} from "@/lib/render";
import type { PipelineSettings, RenderOptions, Tile } from "@/lib/types";
import { cn } from "@/lib/utils";

// Thumbnails are sized so exactly this many columns fill the panel width.
// A grid this size or smaller fits without scrolling; anything larger keeps
// the same per-thumb size and overflows, so you drag to pan instead of the
// tiles shrinking. The gap here must match the grid's `gap-2` (0.5rem).
const THUMB_FIT_COLS = 6;
const THUMB_GAP_PX = 8;
// Floor so a thumbnail never collapses to nothing on a very narrow panel.
const THUMB_MIN_PX = 72;

interface Props {
  tiles: Tile[];
  settings: PipelineSettings;
  itemTextures: Map<string, ImageBitmap>;
  /**
   * Paint-along storage key (image hash + geometry), or null while the
   * hash is being computed. Progress is tracked per key; see
   * paint-progress.ts.
   */
  progressKey: string | null;
}

export function TileViewer({
  tiles,
  settings,
  itemTextures,
  progressKey,
}: Props) {
  const [selected, setSelected] = useState(0);
  const [paintMode, setPaintMode] = useState(false);
  // Ruler focus aid: crosshair per tile index, session-only. Kept per
  // tile so switching maps doesn't lose your place on the previous one.
  const [rulerMode, setRulerMode] = useState(false);
  const [crosshairs, setCrosshairs] = useState<Map<number, Crosshair>>(
    () => new Map(),
  );

  const total = tiles.length;
  const tile = tiles[selected] ?? tiles[0];

  const crosshair = crosshairs.get(selected) ?? null;
  const setCrosshair = useCallback(
    (next: Crosshair | null) => {
      setCrosshairs((prev) => {
        const map = new Map(prev);
        if (next) map.set(selected, next);
        else map.delete(selected);
        return map;
      });
    },
    [selected],
  );

  // The two interactive modes fight over pointer input; enabling one
  // disables the other.
  const togglePaint = () => {
    setPaintMode((v) => {
      if (!v) setRulerMode(false);
      return !v;
    });
  };
  const toggleRuler = () => {
    setRulerMode((v) => {
      if (!v) setPaintMode(false);
      return !v;
    });
  };

  // Paint-along progress: one bit per cell across the whole canvas.
  const cellsPerTile = settings.tileSize * settings.tileSize;
  const totalCells = total * cellsPerTile;
  const progress = usePaintProgress(progressKey, totalCells, cellsPerTile);
  const baseIndex = selected * cellsPerTile;
  const tileDone = useMemo(
    () => countBits(progress.bits, baseIndex, baseIndex + cellsPerTile),
    [progress.bits, baseIndex, cellsPerTile],
  );
  // Per-tile completion for the thumbnails, recomputed only when bits
  // change. Cheap relative to a render: one pass over the bitset.
  const tileCompletion = useMemo(
    () =>
      tiles.map((_, i) =>
        countBits(progress.bits, i * cellsPerTile, (i + 1) * cellsPerTile),
      ),
    [tiles, progress.bits, cellsPerTile],
  );

  // Arrow keys walk the ruler crosshair (Escape clears it). Bound to the
  // document so it works without clicking the canvas first, but skipped
  // while typing in inputs.
  useEffect(() => {
    if (!rulerMode) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable)
        return;
      if (e.key === "Escape") {
        setCrosshair(null);
        return;
      }
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = deltas[e.key];
      if (!d) return;
      e.preventDefault();
      const max = settings.tileSize - 1;
      const cur = crosshairs.get(selected);
      const clamp = (v: number) => Math.min(max, Math.max(0, v));
      // No crosshair yet: arrows start from the top-left cell.
      const x = cur ? cur.x : 0;
      const y = cur ? cur.y : 0;
      setCrosshair({ x: clamp(x + d[0]), y: clamp(y + d[1]) });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rulerMode, crosshairs, selected, settings.tileSize, setCrosshair]);

  // Measure the panel so we can size thumbnails to fit THUMB_FIT_COLS across.
  // Locking that pixel size means bigger grids overflow and pan rather than
  // shrinking the tiles. Grids narrower than THUMB_FIT_COLS use their own
  // column count instead, so a 2-wide grid grows to fill the width rather
  // than leaving a gap where the extra columns would be.
  const [panelW, setPanelW] = useState(0);
  const panelRef = useMeasuredWidth(setPanelW);
  const thumbPx = useMemo(() => {
    if (panelW <= 0) return THUMB_MIN_PX;
    const cols = Math.min(THUMB_FIT_COLS, settings.gridW);
    const gaps = THUMB_GAP_PX * (cols - 1);
    return Math.max(THUMB_MIN_PX, Math.floor((panelW - gaps) / cols));
  }, [panelW, settings.gridW]);

  // One flat preview canvas for the whole grid. Thumbnails are sliced out of
  // this instead of each re-rendering its own guide (no per-cell textures or
  // shade digits), which is dramatically cheaper for large grids. Scale 1 is
  // plenty since thumbs downscale anyway; the slice picks the tile's block.
  const previewCanvas = useMemo(
    () =>
      renderPreviewCanvas(
        tiles,
        settings.gridW,
        settings.gridH,
        settings.tileSize,
        1,
      ),
    [tiles, settings.gridW, settings.gridH, settings.tileSize],
  );

  const fullOpts: RenderOptions = useMemo(
    () => ({
      cellSize: settings.cellSize,
      itemTextures,
      texturePadding: settings.texturePadding,
      tileBorder: settings.tileBorder,
      cellBorder: settings.cellBorder,
      rulerMargin: settings.rulerMargin,
      tileIndex: selected + 1,
      tileTotal: total,
      outlineRuns: true,
    }),
    [
      itemTextures,
      selected,
      settings.cellBorder,
      settings.cellSize,
      settings.rulerMargin,
      settings.texturePadding,
      settings.tileBorder,
      total,
    ],
  );

  // Slice at the native tile size; the thumbnail is CSS-scaled to fit its
  // cell, so the output stays crisp (pixelated) and resizing the panel never
  // re-runs this. Each slice is one tiny drawImage.
  const thumbs = useProgressiveRender(
    tiles,
    (t) =>
      sliceTileThumb(previewCanvas, t, settings.tileSize, 1, settings.tileSize),
    [tiles, settings.tileSize, previewCanvas],
  );

  const fullCanvas = useDeferredValue(
    () => (tile ? renderTileCanvas(tile, settings.tileSize, fullOpts) : null),
    [tile, settings.tileSize, fullOpts],
  );

  if (!tile) {
    return (
      <div className="text-muted-foreground text-sm">No tiles to show.</div>
    );
  }

  return (
    <div className="space-y-3">
      <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-300">
        <Info />
        <AlertTitle>How to use this guide</AlertTitle>
        <AlertDescription className="text-amber-900/90 dark:text-amber-100/85">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Each cell below is one pixel on a map canvas. With the ArtMap
              plugin you right-click the canvas holding the matching item to
              paint that pixel. You do not place any blocks.
            </li>
            <li>
              A picture this size is split across{" "}
              <span className="font-semibold text-amber-950 dark:text-amber-50">
                {total} map{total === 1 ? "" : "s"}
              </span>{" "}
              (128 x 128 pixels each). Use the thumbnails below to jump to the
              map you are currently painting.
            </li>
            <li>
              Numbers on the rulers are the pixel coordinates inside that map.
              The digit in each cell is the shade you need:
            </li>
          </ul>
          <ul className="mt-2 space-y-1 pl-5">
            <li>
              <code className="rounded bg-amber-200/60 px-1 font-mono text-xs text-amber-950 dark:bg-amber-500/25 dark:text-amber-50">
                0
              </code>{" "}
              light shade, right-click once with a{" "}
              <span className="font-semibold">feather</span>.
            </li>
            <li>
              <code className="rounded bg-amber-200/60 px-1 font-mono text-xs text-amber-950 dark:bg-amber-500/25 dark:text-amber-50">
                1
              </code>{" "}
              normal shade, do nothing, this is the default color of the
              palette.
            </li>
            <li>
              <code className="rounded bg-amber-200/60 px-1 font-mono text-xs text-amber-950 dark:bg-amber-500/25 dark:text-amber-50">
                2
              </code>{" "}
              dark shade, right-click once with{" "}
              <span className="font-semibold">coal</span>.
            </li>
            <li>
              <code className="rounded bg-amber-200/60 px-1 font-mono text-xs text-amber-950 dark:bg-amber-500/25 dark:text-amber-50">
                3
              </code>{" "}
              darkest shade, right-click twice with{" "}
              <span className="font-semibold">coal</span>.
            </li>
          </ul>
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={paintMode ? "default" : "outline"}
          size="sm"
          onClick={togglePaint}
          aria-pressed={paintMode}
          title="Track which cells you've painted. Click or drag on the guide to mark them."
        >
          <Brush />
          Paint-along
        </Button>
        <Button
          type="button"
          variant={rulerMode ? "default" : "outline"}
          size="sm"
          onClick={toggleRuler}
          aria-pressed={rulerMode}
          title="Highlight one row and column so you never lose your place. Click a cell to pin, arrow keys to move."
        >
          <Ruler />
          Ruler
        </Button>
        {rulerMode && crosshair ? (
          <Badge variant="outline" className="tabular-nums">
            Cell {crosshair.x + 1}, {crosshair.y + 1}
          </Badge>
        ) : null}
        {paintMode ? (
          <>
            <Badge variant="outline" className="tabular-nums">
              This map: {tileDone}/{cellsPerTile} (
              {Math.floor((tileDone / cellsPerTile) * 100)}%)
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              Total: {progress.done}/{totalCells} (
              {Math.floor((progress.done / totalCells) * 100)}%)
            </Badge>
            <span className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => progress.setTile(selected, true)}
              disabled={tileDone === cellsPerTile}
              title="Mark every cell of this map as painted"
            >
              <Check />
              Map done
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => progress.setTile(selected, false)}
              disabled={tileDone === 0}
              title="Clear this map's progress"
            >
              <Eraser />
              Clear map
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={progress.reset}
              disabled={progress.done === 0}
              title="Wipe progress for the whole canvas"
            >
              <RotateCcw />
              Reset all
            </Button>
          </>
        ) : progress.done > 0 ? (
          <Badge variant="outline" className="tabular-nums">
            {Math.floor((progress.done / totalCells) * 100)}% painted
          </Badge>
        ) : null}
      </div>
      {paintMode ? (
        <p className="text-muted-foreground text-xs">
          Click or drag across cells you&apos;ve painted in-game. Progress is
          saved in your browser per image and canvas size.
          {progressKey === null
            ? " (Still fingerprinting the image; marks made now won't persist.)"
            : ""}
        </p>
      ) : null}
      {rulerMode ? (
        <p className="text-muted-foreground text-xs">
          Click a cell to spotlight its row and column; everything else dims.
          Use arrow keys to step, Escape or a second click to clear. Each map
          remembers its own position.
        </p>
      ) : null}
      <div className="bg-background relative flex min-h-40 items-center justify-center overflow-auto rounded-md border p-4">
        {fullCanvas ? (
          <PaintOverlay
            guideCanvas={fullCanvas}
            tileSize={settings.tileSize}
            cellSize={settings.cellSize}
            rulerMargin={settings.rulerMargin}
            bits={progress.bits}
            baseIndex={baseIndex}
            paintMode={paintMode}
            onPaintCell={(cellIndex, on) =>
              progress.setCell(baseIndex + cellIndex, on)
            }
            rulerMode={rulerMode}
            crosshair={rulerMode ? crosshair : null}
            onCrosshairChange={setCrosshair}
            alt={`Tile ${tile.gx},${tile.gy}`}
          />
        ) : (
          <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Rendering guide
          </div>
        )}
      </div>
      {/* Thumbnails are sized so THUMB_FIT_COLS fill the panel width, then
       * locked at that size. A 3x3 (or smaller) fits exactly; bigger grids
       * keep the same tile size and overflow, so you drag to pan instead of
       * the tiles shrinking. The wrapper is measured to drive that size. */}
      {settings.gridW > THUMB_FIT_COLS ? (
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <Hand className="size-3.5" aria-hidden />
          Drag the guides below to pan across all {total} maps.
        </p>
      ) : null}
      <div ref={panelRef}>
        <PanContainer className="py-1" maxHeight="60vh">
          <div
            className="grid w-max gap-2"
            style={{
              gridTemplateColumns: `repeat(${settings.gridW}, ${thumbPx}px)`,
            }}
          >
            {tiles.map((t, i) => {
              const canvas = thumbs[i];
              return canvas ? (
                <TileThumb
                  key={i}
                  canvas={canvas}
                  selected={i === selected}
                  onClick={() => setSelected(i)}
                  label={`${t.gx},${t.gy}`}
                  doneRatio={tileCompletion[i]! / cellsPerTile}
                />
              ) : (
                <ThumbPlaceholder
                  key={i}
                  selected={i === selected}
                  onClick={() => setSelected(i)}
                  label={`${t.gx},${t.gy}`}
                />
              );
            })}
          </div>
        </PanContainer>
      </div>
      {thumbs.filter(Boolean).length !== tiles.length ? (
        <div className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <Loader2 className="size-3 animate-spin" />
          Rendering thumbnails ({thumbs.filter(Boolean).length}/{tiles.length})
        </div>
      ) : null}
    </div>
  );
}

function TileThumb({
  canvas,
  selected,
  onClick,
  label,
  doneRatio,
}: {
  canvas: AnyCanvas;
  selected: boolean;
  onClick: () => void;
  label: string;
  /** 0..1 painted fraction; >= 1 marks the tile complete. */
  doneRatio: number;
}) {
  const complete = doneRatio >= 1;
  return (
    <Button
      variant={selected ? "default" : "outline"}
      size="sm"
      className="relative flex h-auto w-full flex-col gap-1 p-1.5"
      onClick={onClick}
      aria-label={`Tile ${label}${complete ? " (painted)" : ""}`}
    >
      <div className="aspect-square w-full overflow-hidden rounded-sm">
        <CanvasView
          source={canvas}
          className="block h-full w-full object-contain"
        />
      </div>
      {complete ? (
        <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
          <Check className="size-3" />
        </span>
      ) : null}
      <span
        className={cn(
          "text-[10px] leading-none",
          complete && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {label}
      </span>
    </Button>
  );
}

function ThumbPlaceholder({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      variant={selected ? "default" : "outline"}
      size="sm"
      className="flex h-auto w-full flex-col gap-1 p-1.5"
      onClick={onClick}
      aria-label={`Tile ${label}`}
    >
      <div className="bg-muted flex aspect-square w-full items-center justify-center rounded-sm">
        <Loader2 className="text-muted-foreground size-3 animate-spin" />
      </div>
      <span className="text-[10px] leading-none">{label}</span>
    </Button>
  );
}

/**
 * Renders one value after the first paint so the surrounding UI can show a
 * spinner immediately. Re-runs whenever `deps` change.
 */
function useDeferredValue<T>(
  compute: () => T | null,
  deps: React.DependencyList,
): T | null {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(null);
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const v = compute();
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}

/**
 * Progressively produces an array, yielding to the browser every few ms so
 * the UI stays responsive. Slots are `undefined` until computed.
 */
function useProgressiveRender<T, R>(
  items: readonly T[],
  compute: (item: T, index: number) => R,
  deps: React.DependencyList,
): (R | undefined)[] {
  const [out, setOut] = useState<(R | undefined)[]>(() =>
    new Array(items.length).fill(undefined),
  );

  useEffect(() => {
    let cancelled = false;
    const slots: (R | undefined)[] = new Array(items.length).fill(undefined);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOut(slots);
    let i = 0;

    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const step = () => {
      if (cancelled) return;
      const deadline = now() + 8;
      while (i < items.length && now() < deadline) {
        slots[i] = compute(items[i]!, i);
        i++;
      }
      if (cancelled) return;
      setOut(slots.slice());
      if (i < items.length) requestAnimationFrame(step);
    };
    const raf = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return out;
}
/**
 * Ref callback that reports an element's content-box width and keeps it
 * current via a ResizeObserver. Used to size thumbnails to the panel.
 */
function useMeasuredWidth(
  onWidth: (w: number) => void,
): (el: HTMLElement | null) => void {
  const cb = useRef(onWidth);
  // Keep the latest callback in the ref without touching it during render
  // (the React Compiler flags ref writes in render). An effect is the right
  // place: it runs after commit, so the ref callback always sees the current
  // onWidth without re-creating the observer.
  useEffect(() => {
    cb.current = onWidth;
  }, [onWidth]);

  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    cb.current(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w =
          entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        cb.current(Math.floor(w));
      }
    });
    ro.observe(el);
    // The cleanup runs when React detaches the ref (unmount or ref change).
    return () => ro.disconnect();
  }, []);
}
