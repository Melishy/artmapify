"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filename (sans path) we just downloaded, used in the example command. */
  fileName?: string;
}

/**
 * Help dialog explaining what to do with the downloaded ArtMap JSON.
 * Opened on demand from a "How to import" button.
 */
export function ArtMapImportInstructions({
  open,
  onOpenChange,
  fileName,
}: Props) {
  const safeName = fileName?.trim() || "artmap.json";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How to import this into Minecraft</DialogTitle>
          <DialogDescription>
            One row per 32×32 map tile. Drop the file into your ArtMap server
            and run the import command as a player with admin permission.
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Make sure the{" "}
            <a
              href="https://gitlab.com/BlockStack/ArtMap"
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium underline-offset-2 hover:underline"
            >
              ArtMap plugin
            </a>{" "}
            is installed on your Spigot/Paper server.
          </li>
          <li>
            Copy the downloaded file into{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              plugins/ArtMap/
            </code>{" "}
            on the server.
          </li>
          <li>
            Join the server and run, as a player with{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              artmap.admin
            </code>
            :
            <CommandBlock command={`/art import -all ${safeName}`} />
          </li>
          <li>
            ArtMap will print&nbsp;
            <span className="italic">N artworks available for import</span> and
            register each tile under its own title (for grids the suffix is{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              _R&lt;row&gt;C&lt;col&gt;
            </code>
            ).
          </li>
          <li>
            Find your tiles via{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              /art list
            </code>{" "}
            and place each map in an item frame. Arrange them in the same grid
            you exported (R1C1 top-left, columns left-to-right, rows
            top-to-bottom) to reassemble the full image.
          </li>
        </ol>

        <p className="text-muted-foreground text-xs">
          Re-running an import is safe: ArtMap detects identical (artist + hash)
          entries and skips them. If the same title belongs to a different
          artwork, it appends{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
            _1
          </code>
          .
        </p>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
/**
 * Code-block-style snippet with a copy button. The button briefly shows
 * a check icon after a successful copy as confirmation.
 */
function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  // Auto-revert the "copied" indicator after a short hold.
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Older browsers / insecure contexts: fall back to a textarea + execCommand.
      try {
        const ta = document.createElement("textarea");
        ta.value = command;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        setCopied(true);
      } catch {
        // Give up silently; the user can still select+copy by hand.
      }
    }
  };

  return (
    <div className="group/cmd bg-muted relative mt-1 max-w-full rounded">
      {/* min-w-0 lets the pre shrink inside its flex/grid ancestors so the
       * scrollbar takes effect on long filenames instead of expanding the
       * dialog. */}
      <pre className="min-w-0 overflow-x-auto px-2 py-1.5 pr-9 font-mono text-xs">
        {command}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy command"}
        className="bg-muted text-muted-foreground hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:text-foreground absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded transition-colors focus-visible:outline-none"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-500" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}
