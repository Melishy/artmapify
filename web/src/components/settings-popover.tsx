"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ControlsPanel } from "@/components/controls-panel";
import { GitHubStarButton } from "@/components/github-star-button";
import { Button } from "@/components/ui/button";
import { SupportButton } from "@/components/support-button";
import type { PipelineSettings } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: PipelineSettings;
  aspectAuto: boolean;
  onChange: (next: PipelineSettings) => void;
  onAspectAutoChange: (v: boolean) => void;
  onReset: () => void;
}

const ENTER_MS = 180;
const EXIT_MS = 140;

/**
 * Floating settings popover. Keeps the panel mounted briefly during the
 * close animation so the exit transition gets a chance to play.
 *
 * Layout: fixed-position centered card with margins on every side, so it
 * doesn't touch the viewport edges. Animations live in globals.css under
 * the @keyframes settings-pop-{in,out} pair.
 */
export function SettingsPopover(props: Props) {
  const {
    open,
    onClose,
    settings,
    aspectAuto,
    onChange,
    onAspectAutoChange,
    onReset,
  } = props;

  // Two-state lifecycle: `mounted` keeps the DOM around through the exit
  // animation; `phase` switches between "in" and "out" to drive the
  // animation classes.
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<"in" | "out">(open ? "in" : "out");
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (exitTimer.current) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      // Schedule the "in" phase on the next frame so the browser
      // commits the initial styles first.
      requestAnimationFrame(() => setPhase("in"));
    } else if (mounted) {
      setPhase("out");
      exitTimer.current = window.setTimeout(() => {
        setMounted(false);
        exitTimer.current = null;
      }, EXIT_MS);
    }
    return () => {
      if (exitTimer.current) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
    };
  }, [open, mounted]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const isOpening = phase === "in";

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="bg-foreground/10 fixed inset-0 z-40 cursor-default backdrop-blur-[2px]"
        style={{
          animation: `${isOpening ? "settings-backdrop-in" : "settings-backdrop-out"} ${
            isOpening ? ENTER_MS : EXIT_MS
          }ms ease forwards`,
        }}
      />

      {/* Floating popover. Fixed-positioned, with viewport margins so it
       * never touches the edges. Width caps at max-w-5xl on large screens. */}
      <div
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        className="bg-background fixed top-[68px] left-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl rounded-xl border shadow-2xl"
        style={{
          // The animation already includes translate(-50%, ...) so we don't
          // need a separate transform for centering.
          animation: `${isOpening ? "settings-pop-in" : "settings-pop-out"} ${
            isOpening ? ENTER_MS : EXIT_MS
          }ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
          maxHeight: "calc(100vh - 96px)",
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">Settings</h2>
          <div className="flex items-center gap-2">
            {/* Mirror of the topbar links. They show here only at the widths
             * where the toolbar hides them, so the actions stay reachable:
             * support under 400px, GitHub under 480px. */}
            <span className="inline-flex min-[400px]:hidden">
              <SupportButton email="themelishy@outlook.com" />
            </span>
            <span className="inline-flex min-[480px]:hidden">
              <GitHubStarButton owner="Melishy" repo="artmapify" />
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              aria-label="Close settings"
            >
              <X />
            </Button>
          </div>
        </div>
        <div
          className="overflow-y-auto px-4 py-4"
          style={{ maxHeight: "calc(100vh - 96px - 41px)" }}
        >
          <ControlsPanel
            settings={settings}
            aspectAuto={aspectAuto}
            onChange={onChange}
            onAspectAutoChange={onAspectAutoChange}
            onReset={onReset}
          />
        </div>
      </div>
    </>
  );
}
