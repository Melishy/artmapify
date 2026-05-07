"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Listen for clipboard paste events and forward any image payload to
 * `onImage`. Bound to the document so users can paste anywhere on the
 * page (Ctrl+V / Cmd+V), except inside text inputs and textareas where
 * the browser's default paste behavior should win.
 */
export function usePasteImageListener(
  onImage: (file: File) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Don't hijack paste while the user is typing into a field.
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (target?.isContentEditable) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item.kind !== "file") continue;
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        // Some browsers give the pasted image an empty filename; coerce
        // to a stable name so downstream "*-artmapify.zip" naming has
        // something sensible to derive from.
        const named =
          file.name && file.name !== "image.png"
            ? file
            : new File([file], `clipboard-${Date.now()}.png`, {
                type: file.type || "image/png",
              });
        onImage(named);
        return;
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [onImage, enabled]);
}

/**
 * Try to read an image from the async Clipboard API. Used by the "Paste"
 * button so it works even when the user clicks the button instead of
 * pressing Ctrl+V (which the paste event handles).
 *
 * Returns the resolved File or throws an Error with a user-facing message.
 */
async function readImageFromClipboard(): Promise<File> {
  if (!navigator.clipboard?.read) {
    throw new Error(
      "Clipboard API not available. Try pressing Ctrl+V (or Cmd+V) instead.",
    );
  }
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch (e) {
    // Permission denied is the common case here.
    throw new Error(
      e instanceof Error && e.message
        ? `Couldn't read clipboard: ${e.message}`
        : "Couldn't read clipboard. Allow clipboard access or press Ctrl+V instead.",
    );
  }
  for (const item of items) {
    const imageType = item.types.find((t) => t.startsWith("image/"));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    return new File([blob], `clipboard-${Date.now()}.png`, {
      type: blob.type || "image/png",
    });
  }
  throw new Error("No image found in clipboard.");
}

/**
 * Convenience hook combining the two: returns a stable click handler for
 * a "Paste" button while also wiring the document-level paste listener.
 */
export function useClipboardImage(onImage: (file: File) => void): {
  paste: () => Promise<void>;
  error: string | null;
  clearError: () => void;
} {
  usePasteImageListener(onImage);
  const [error, setError] = useState<string | null>(null);
  const paste = useCallback(async () => {
    setError(null);
    try {
      const file = await readImageFromClipboard();
      onImage(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [onImage]);
  return {
    paste,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
