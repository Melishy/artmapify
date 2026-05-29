"use client";

import { Clipboard, ImageIcon, Upload, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { useClipboardImage } from "@/lib/use-clipboard-image";
import { cn } from "@/lib/utils";

type PickFile = (file: File) => void;

function useFilePicker(onFile: PickFile) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const handleFile = useCallback(
    (f: File | null) => {
      if (!f) return;
      if (!f.type.startsWith("image/")) return;
      onFile(f);
    },
    [onFile],
  );

  const input = (
    <input
      ref={inputRef}
      id={id}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
    />
  );

  return {
    input,
    pick: () => inputRef.current?.click(),
    handleFile,
  };
}

/**
 * Large drop target used as the empty-state hero before any file is chosen.
 */
export function DropTarget({
  onFile,
  className,
}: {
  onFile: PickFile;
  className?: string;
}) {
  const { input, pick, handleFile } = useFilePicker(onFile);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
        "hover:bg-muted/40 cursor-pointer",
        dragging ? "border-primary bg-muted" : "",
        className,
      )}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") pick();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0] ?? null);
      }}
      role="button"
      tabIndex={0}
      aria-label="Choose an image"
    >
      {input}
      <Upload className="text-muted-foreground size-8" />
      <div>
        <div className="font-medium">Drop an image to get started</div>
        <div className="text-muted-foreground text-sm">
          or click to browse (PNG, JPG, WebP, ...)
        </div>
      </div>
    </div>
  );
}

/**
 * Compact source chip for the toolbar: shows a thumbnail and filename, clicks
 * to replace. Also accepts drag-drops and exposes an inline clear (×)
 * button.
 */
export function SourceChip({
  onFile,
  onClear,
  file,
  dimensions,
}: {
  onFile: PickFile;
  /** Called when the user clicks the × button. */
  onClear?: () => void;
  file: File;
  dimensions?: { w: number; h: number } | null;
}) {
  const { input, pick, handleFile } = useFilePicker(onFile);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className={cn(
        "group bg-background flex h-9 items-center gap-1 rounded-md border pr-1 pl-1 text-left text-xs transition-colors",
        dragging ? "border-primary bg-muted" : "",
      )}
    >
      {input}
      <button
        type="button"
        onClick={pick}
        className="hover:bg-muted focus-visible:bg-muted -my-px flex h-full min-w-0 items-center gap-2 rounded-sm py-1 pr-1 pl-1 text-left transition-colors focus-visible:outline-none"
        aria-label={`Replace ${file.name}`}
        title="Click or drop to replace"
      >
        <span className="bg-muted relative block size-6 shrink-0 overflow-hidden rounded-sm">
          {previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <ImageIcon className="text-muted-foreground absolute inset-1 size-4" />
          )}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="max-w-[14rem] truncate font-medium">
            {file.name}
          </span>
          {dimensions ? (
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {dimensions.w} x {dimensions.h}
            </span>
          ) : null}
        </span>
      </button>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear image"
          title="Clear image"
          className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-none"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * "Choose file" + "Paste" buttons for when there's no file yet, used in
 * the toolbar. Also wires up document-level Ctrl+V paste so the user can
 * paste from anywhere on the page.
 */
export function SourceButton({ onFile }: { onFile: PickFile }): ReactNode {
  const { input, pick } = useFilePicker(onFile);
  const handleImage = useCallback(
    (f: File) => {
      if (f.type.startsWith("image/")) onFile(f);
    },
    [onFile],
  );
  const { paste, error, clearError } = useClipboardImage(handleImage);
  return (
    <>
      {input}
      <Button
        variant="default"
        size="sm"
        onClick={pick}
        title="Choose an image"
        aria-label="Choose image"
      >
        <Upload />
        <span className="hidden lg:inline">Choose image</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          clearError();
          void paste();
        }}
        title="Paste an image from clipboard (Ctrl+V works anywhere on the page)"
        aria-label="Paste image"
      >
        <Clipboard />
        <span className="hidden lg:inline">Paste</span>
      </Button>
      {error ? (
        <span className="text-destructive text-[10px]" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
