"use client";

import { ImageIcon, Upload } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
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
        "cursor-pointer hover:bg-muted/40",
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
      <Upload className="size-8 text-muted-foreground" />
      <div>
        <div className="font-medium">Drop an image to get started</div>
        <div className="text-sm text-muted-foreground">
          or click to browse (PNG, JPG, WebP, ...)
        </div>
      </div>
    </div>
  );
}

/**
 * Compact source chip for the toolbar: shows a thumbnail and filename, clicks
 * to replace. Also accepts drag-drops.
 */
export function SourceChip({
  onFile,
  file,
  dimensions,
}: {
  onFile: PickFile;
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
    <button
      type="button"
      onClick={pick}
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
        "group flex h-9 items-center gap-2 rounded-md border bg-background px-2 py-1 text-left text-xs transition-colors hover:bg-muted",
        dragging ? "border-primary bg-muted" : "",
      )}
      aria-label={`Replace ${file.name}`}
      title="Click or drop to replace"
    >
      {input}
      <span className="relative block size-6 shrink-0 overflow-hidden rounded-sm bg-muted">
        {previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <ImageIcon className="absolute inset-1 size-4 text-muted-foreground" />
        )}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="max-w-[14rem] truncate font-medium">{file.name}</span>
        {dimensions ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {dimensions.w} x {dimensions.h}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * "Choose file" button for when there's no file yet, used in the toolbar.
 */
export function SourceButton({ onFile }: { onFile: PickFile }): ReactNode {
  const { input, pick } = useFilePicker(onFile);
  return (
    <>
      {input}
      <Button variant="default" size="sm" onClick={pick}>
        <Upload />
        Choose image
      </Button>
    </>
  );
}
