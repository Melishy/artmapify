"use client";

import { Check, Copy, Heart } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  /** PayPal account email donations are sent to. */
  email: string;
  /** Visible label on >=lg screens. Smaller widths collapse to icon-only. */
  label?: string;
}

/**
 * Animated, outline-style support button. The ring is a conic gradient
 * that rotates behind the inner pill (gradient-border trick).
 *
 * Clicking opens a dialog with the PayPal email so people can send a
 * donation manually (PayPal.me and hosted donate links aren't available
 * in every region, so we just hand over the address).
 *
 * Sizing is locked to match Button size="sm" (h-7) so it sits flush
 * with the GitHub Star button next to it on every viewport. On smaller
 * screens the label collapses to keep the button compact.
 */
export function SupportButton({ email, label = "Donate" }: Props) {
  const [copied, setCopied] = useState(false);

  // Reset the copied state shortly after a successful copy so the icon
  // flips back from the checkmark.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure context, denied permission).
      // Fail quietly; the address is shown in full for manual copying.
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        aria-label="Support this project"
        className="group/support relative inline-flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-[10px] p-[1.5px] text-[0.8rem] leading-none font-medium transition-transform hover:-translate-y-px focus-visible:ring-3 focus-visible:ring-[hsl(0_85%_64%/0.4)] focus-visible:outline-none active:translate-y-px"
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
        {/* Inner pill carrying the actual content. The label hides below lg so
         * the button doesn't dominate the toolbar on smaller screens. */}
        <span className="bg-background text-foreground group-hover/support:bg-background/95 relative z-10 flex h-[calc(100%-3px)] items-center gap-1.5 rounded-[9px] px-2.5 transition-colors">
          <Heart className="size-3.5 shrink-0 text-[#ff5e5b]" aria-hidden />
          <span className="hidden lg:inline">{label}</span>
        </span>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="size-4 text-[#ff5e5b]" aria-hidden />
            Support ArtMapify
          </DialogTitle>
          <DialogDescription>
            ArtMapify is free. If it saved you some time, you can send a
            donation to my PayPal using the email below.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={copyEmail}
          aria-label={copied ? "Email copied" : `Copy ${email}`}
          className="bg-muted/40 hover:bg-muted focus-visible:ring-ring/50 group/copy flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="font-mono text-sm break-all">{email}</span>
          {copied ? (
            <Check className="size-4 shrink-0 text-emerald-500" aria-hidden />
          ) : (
            <Copy
              className="text-muted-foreground group-hover/copy:text-foreground size-4 shrink-0 transition-colors"
              aria-hidden
            />
          )}
        </button>

        <p className="text-muted-foreground text-xs">
          {copied ? "Copied to clipboard." : "Click the address to copy it."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
