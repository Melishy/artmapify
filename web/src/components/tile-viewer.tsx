"use client";

import { Hand, Info, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasView } from "./canvas-view";
import { PanContainer } from "./pan-container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AnyCanvas } from "@/lib/render";
import {
  renderPreviewCanvas,
  renderTileCanvas,
  sliceTileThumb,
} from "@/lib/render";
import type { PipelineSettings, RenderOptions, Tile } from "@/lib/types";

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
}

export function TileViewer({ tiles, settings, itemTextures }: Props) {
  const [selected, setSelected] = useState(0);

  const total = tiles.length;
  const tile = tiles[selected] ?? tiles[0];

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
      <div className="bg-background relative flex min-h-40 items-center justify-center overflow-auto rounded-md border p-4">
        {fullCanvas ? (
          <CanvasView
            source={fullCanvas}
            className="h-auto max-w-full"
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
}: {
  canvas: AnyCanvas;
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
      <div className="aspect-square w-full overflow-hidden rounded-sm">
        <CanvasView
          source={canvas}
          className="block h-full w-full object-contain"
        />
      </div>
      <span className="text-[10px] leading-none">{label}</span>
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