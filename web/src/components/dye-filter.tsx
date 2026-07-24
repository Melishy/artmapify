"use client";

import { Check, Filter, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CanvasView } from "./canvas-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Palette } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  palette: Palette;
  itemTextures: Map<string, ImageBitmap> | null;
  /** Bases currently excluded from matching. */
  excludedBases: string[];
  onChange: (next: string[]) => void;
}

interface BaseItem {
  base: string;
  name: string;
  /** rgb of the default (shade 1) entry, for the swatch. */
  rgb: readonly [number, number, number];
}

/**
 * "Dyes I have" filter. Opens a dialog listing every palette item; unticked
 * items are excluded from color matching so guides only ever ask for dyes
 * the player can actually craft. State lives in PipelineSettings so it
 * persists and travels to the worker with everything else.
 */
export function DyeFilter({
  palette,
  itemTextures,
  excludedBases,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // One row per item (not per shade); prefer the default shade's rgb.
  const items = useMemo<BaseItem[]>(() => {
    const map = new Map<string, BaseItem>();
    for (const e of palette.entries) {
      const existing = map.get(e.base);
      if (!existing || e.shade === 1) {
        map.set(e.base, { base: e.base, name: e.name, rgb: e.rgb });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [palette]);

  const excluded = useMemo(() => new Set(excludedBases), [excludedBases]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.base.includes(q),
    );
  }, [items, query]);

  const excludedCount = excludedBases.length;
  const allExcluded = excludedCount >= items.length;

  const toggle = (base: string) => {
    if (excluded.has(base)) onChange(excludedBases.filter((b) => b !== base));
    else onChange([...excludedBases, base]);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Filter />
        {excludedCount === 0
          ? "Dyes I have: all"
          : `Dyes I have: ${items.length - excludedCount}/${items.length}`}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="size-4" />
              Dyes I have
            </DialogTitle>
            <DialogDescription>
              Untick anything you can&apos;t craft yet. Matching only uses the
              ticked items, so the guide never asks for a dye you don&apos;t
              have. Fewer dyes = rougher color, especially with dither off.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items"
              className="h-8"
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onChange([])}
              disabled={excludedCount === 0}
            >
              All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onChange(items.map((i) => i.base))}
              disabled={allExcluded}
            >
              None
            </Button>
          </div>

          {allExcluded ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Everything is unticked, so the full palette is used instead.
            </p>
          ) : null}

          <div className="grid max-h-[50vh] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
            {filtered.map((item) => {
              const have = !excluded.has(item.base);
              const [r, g, b] = item.rgb;
              const texture = itemTextures?.get(item.base) ?? null;
              return (
                <button
                  key={item.base}
                  type="button"
                  onClick={() => toggle(item.base)}
                  aria-pressed={have}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                    have
                      ? "bg-background hover:bg-muted/60"
                      : "bg-muted/40 opacity-55 hover:opacity-80",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      have
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background",
                    )}
                  >
                    {have ? <Check className="size-3" /> : null}
                  </span>
                  <span className="bg-muted size-6 shrink-0 overflow-hidden rounded-sm border">
                    {texture ? (
                      <CanvasView
                        source={texture}
                        className="block h-full w-full object-contain"
                        alt=""
                      />
                    ) : null}
                  </span>
                  <span
                    className={cn("flex-1 truncate", !have && "line-through")}
                  >
                    {item.name}
                  </span>
                  <span
                    className="size-3.5 shrink-0 rounded-sm border"
                    style={{ backgroundColor: `rgb(${r},${g},${b})` }}
                    aria-hidden
                  />
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="text-muted-foreground col-span-full py-4 text-center text-xs">
                No items match &quot;{query}&quot;.
              </p>
            ) : null}
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <Badge variant="outline">
              {items.length - excludedCount}/{items.length} items in use
            </Badge>
            <Button size="sm" onClick={() => setOpen(false)}>
              <X />
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
