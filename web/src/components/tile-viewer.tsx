"use client";

import { Info, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CanvasView } from "./canvas-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AnyCanvas } from "@/lib/render";
import { renderTileCanvas } from "@/lib/render";
import type { PipelineSettings, RenderOptions, Tile } from "@/lib/types";

interface Props {
  tiles: Tile[];
  settings: PipelineSettings;
  itemTextures: Map<string, ImageBitmap>;
}

export function TileViewer({ tiles, settings, itemTextures }: Props) {
  const [selected, setSelected] = useState(0);

  const total = tiles.length;
  const tile = tiles[selected] ?? tiles[0];

  const thumbOpts: RenderOptions = useMemo(
    () => ({
      cellSize: Math.max(4, Math.floor(settings.cellSize / 4)),
      itemTextures,
      texturePadding: settings.texturePadding,
      cellBorder: 0,
      rulerMargin: 0,
      outlineRuns: true,
    }),
    [itemTextures, settings.cellSize, settings.texturePadding],
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

  const thumbs = useProgressiveRender(
    tiles,
    (t) => renderTileCanvas(t, settings.tileSize, thumbOpts),
    [tiles, settings.tileSize, thumbOpts],
  );

  const fullCanvas = useDeferredValue(
    () =>
      tile ? renderTileCanvas(tile, settings.tileSize, fullOpts) : null,
    [tile, settings.tileSize, fullOpts],
  );

  if (!tile) {
    return (
      <div className="text-sm text-muted-foreground">No tiles to show.</div>
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
              (128 x 128 pixels each). Use the thumbnails below to jump to
              the map you are currently painting.
            </li>
            <li>
              Numbers on the rulers are the pixel coordinates inside that
              map. The digit in each cell is the shade you need:
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
      <div className="relative flex min-h-40 items-center justify-center overflow-auto rounded-md border bg-background p-4">
        {fullCanvas ? (
          <CanvasView
            source={fullCanvas}
            className="h-auto max-w-full"
            alt={`Tile ${tile.gx},${tile.gy}`}
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Rendering guide
          </div>
        )}
      </div>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${settings.gridW}, minmax(0, 1fr))`,
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
      {thumbs.filter(Boolean).length !== tiles.length ? (
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
      <div className="flex aspect-square w-full items-center justify-center rounded-sm bg-muted">
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
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
