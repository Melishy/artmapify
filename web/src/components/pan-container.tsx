"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  /** Max height of the scroll viewport (CSS value). Defaults to 70vh. */
  maxHeight?: string;
}

// Thickness of the gradient strip at each edge.
const FADE_SIZE_PX = 32;
// Hidden-content distance (px) over which a fade ramps from off to full, so
// it eases in as you scroll toward an end rather than snapping.
const FADE_RAMP_PX = 28;

/**
 * Scrollable viewport you can pan by click-and-drag (grab anywhere and
 * push, like a map). Wheel and trackpad scrolling still work as usual;
 * this just adds mouse-drag panning so big grids that overflow the
 * viewport stay reachable without hunting for scrollbars. The native
 * scrollbars are hidden to keep it clean.
 *
 * Drags can start anywhere, including on tiles; a movement threshold
 * separates a click from a drag, and the trailing click after a real drag
 * is swallowed so panning over a tile doesn't also select it.
 */
export function PanContainer({ children, className, maxHeight = "70vh" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Edge fade overlays. Their opacity is written straight to the DOM here
  // (not through React state) on scroll/resize: it's a per-frame visual that
  // shouldn't re-render the big scrollable content, and writing the node
  // directly sidesteps the compiler memoizing a derived style. Each fade only
  // shows when there's hidden content past that edge, so flush edges stay
  // clear instead of drawing a frame around everything.
  const fadeT = useRef<HTMLDivElement>(null);
  const fadeR = useRef<HTMLDivElement>(null);
  const fadeB = useRef<HTMLDivElement>(null);
  const fadeL = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const updateFades = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = ref.current;
      if (!el) return;
      const maxX = el.scrollWidth - el.clientWidth;
      const maxY = el.scrollHeight - el.clientHeight;
      const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
      if (fadeT.current)
        fadeT.current.style.opacity = `${clamp01(el.scrollTop / FADE_RAMP_PX)}`;
      if (fadeB.current)
        fadeB.current.style.opacity = `${clamp01((maxY - el.scrollTop) / FADE_RAMP_PX)}`;
      if (fadeL.current)
        fadeL.current.style.opacity = `${clamp01(el.scrollLeft / FADE_RAMP_PX)}`;
      if (fadeR.current)
        fadeR.current.style.opacity = `${clamp01((maxX - el.scrollLeft) / FADE_RAMP_PX)}`;
    });
  }, []);

  // Recompute on mount and whenever the viewport or its content resizes.
  // Thumbnails render progressively, so the content only starts overflowing
  // after mount (which fires no scroll event); the ResizeObserver catches it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateFades();
    const ro = new ResizeObserver(() => updateFades());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        // Reset so a future updateFades isn't blocked thinking a frame is
        // still pending. Without this, Strict Mode / HMR re-running the
        // effect leaves a stale (already-cancelled) id here and the fade
        // never updates again.
        rafRef.current = null;
      }
    };
  }, [updateFades]);

  // Pointer + scroll origin captured on pointerdown, plus whether we've
  // crossed the movement threshold to count as a real pan, and whether a
  // drag just ended (so the trailing click can be swallowed).
  const state = useRef({
    active: false,
    moved: false,
    justDragged: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left button only. We start tracking a potential pan from anywhere,
    // including on top of tiles/buttons, so the whole surface is grabbable.

    // A press that doesn't move stays a normal click (the child button still
    // fires); only once movement crosses the threshold do we treat it as a
    // drag and then swallow the trailing click so it can't also select.
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    state.current = {
      active: true,
      moved: false,
      justDragged: false,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.moved && Math.hypot(dx, dy) < 4) return;
    if (!s.moved) {
      s.moved = true;
      setDragging(true);
      // Capture so we keep getting moves even if the pointer leaves the box.
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = s.scrollLeft - dx;
    el.scrollTop = s.scrollTop - dy;
    // No explicit recompute here: writing scrollLeft/Top emits a scroll
    // event, and onScroll already drives the (rAF-coalesced) fade update.
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s.active) return;
    s.active = false;
    if (s.moved) {
      setDragging(false);
      ref.current?.releasePointerCapture?.(e.pointerId);
      // A drag just ended. The browser still fires a click on whatever tile
      // the pointer came up over, so flag it and swallow that one click in
      // the capture phase below; otherwise panning over a tile would also
      // select it.
      state.current.justDragged = true;
    }
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (state.current.justDragged) {
      state.current.justDragged = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onScroll={updateFades}
        className={cn(
          "[scrollbar-width:none] overflow-auto overscroll-contain [&::-webkit-scrollbar]:hidden",
          // Force the grab cursor onto every descendant too, otherwise the
          // tile buttons' own cursor-pointer wins on hover and the surface
          // doesn't read as draggable.
          dragging
            ? "cursor-grabbing select-none [&_*]:cursor-grabbing"
            : "cursor-grab [&_*]:cursor-grab",
          className,
        )}
        style={{ maxHeight, touchAction: "pan-x pan-y" }}
      >
        {children}
      </div>

      {/* Per-edge fades. Sibling overlays (not a mask) so writing their
       * opacity never re-renders the content. Start at opacity 0 (flush edge)
       * and the scroll handler raises only the edges with hidden content. The
       * short transition softens the in/out so it eases rather than snaps. */}
      <div
        ref={fadeT}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-200"
        style={{
          opacity: 0,
          height: FADE_SIZE_PX,
          background: "linear-gradient(to top, transparent, var(--background))",
        }}
      />
      <div
        ref={fadeB}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-200"
        style={{
          opacity: 0,
          height: FADE_SIZE_PX,
          background:
            "linear-gradient(to bottom, transparent, var(--background))",
        }}
      />
      <div
        ref={fadeL}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 transition-opacity duration-200"
        style={{
          opacity: 0,
          width: FADE_SIZE_PX,
          background: "linear-gradient(to left, transparent, var(--background))",
        }}
      />
      <div
        ref={fadeR}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 transition-opacity duration-200"
        style={{
          opacity: 0,
          width: FADE_SIZE_PX,
          background:
            "linear-gradient(to right, transparent, var(--background))",
        }}
      />
    </div>
  );
}