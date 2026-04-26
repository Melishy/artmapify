"use client";

import { useEffect, useRef } from "react";
import type { AnyCanvas } from "@/lib/render";

interface Props {
  source: AnyCanvas | ImageBitmap | null;
  className?: string;
  alt?: string;
}

/**
 * Displays an AnyCanvas (OffscreenCanvas or HTMLCanvasElement) on screen by
 * blitting its pixels into a visible <canvas>.
 */
export function CanvasView({ source, className, alt }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!source) {
      el.width = 0;
      el.height = 0;
      return;
    }
    el.width = source.width;
    el.height = source.height;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(source as CanvasImageSource, 0, 0);
  }, [source]);

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label={alt}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
