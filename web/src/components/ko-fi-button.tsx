"use client";

import { Coffee } from "lucide-react";

interface Props {
  username: string;
  /** Visible label on >=sm screens. Mobile collapses to icon-only. */
  label?: string;
}

/**
 * Animated, outline-style Ko-fi support button. The ring is a conic
 * gradient that rotates behind the inner pill (gradient-border trick).
 *
 * Sizing is locked to match Button size="sm" (h-7) so it sits flush
 * with the GitHub Star button next to it on every viewport. On mobile
 * the label collapses to keep the button compact.
 */
export function KoFiButton({ username, label = "Buy me a coffee" }: Props) {
  return (
    <a
      href={`https://ko-fi.com/${username}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Support ${username} on Ko-fi`}
      className="group/kofi relative inline-flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-[10px] p-[1.5px] text-[0.8rem] leading-none font-medium transition-transform hover:-translate-y-px focus-visible:ring-3 focus-visible:ring-[hsl(0_85%_64%/0.4)] focus-visible:outline-none active:translate-y-px"
    >
      {/* Rotating conic gradient ring. The keyframe lives in globals.css. */}
      <span
        aria-hidden
        className="absolute inset-[-200%] animate-[kofi-spin_4s_linear_infinite]"
        style={{
          backgroundImage:
            "conic-gradient(from 0deg, #ff5e5b, #ffb13b, #ff5e5b 50%, #ffd66b, #ff5e5b)",
        }}
      />
      {/* Inner pill carrying the actual content. flex-1 + min-h ensures
       * the inner element fills the link and has consistent height across
       * browsers; px-2.5 matches Button sm. The label hides below lg so the
       * button doesn't dominate the toolbar on smaller screens. */}
      <span className="bg-background text-foreground group-hover/kofi:bg-background/95 relative z-10 flex h-[calc(100%-3px)] items-center gap-1.5 rounded-[9px] px-2.5 transition-colors">
        <Coffee className="size-3.5 shrink-0 text-[#ff5e5b]" aria-hidden />
        <span className="hidden lg:inline">{label}</span>
      </span>
    </a>
  );
}
