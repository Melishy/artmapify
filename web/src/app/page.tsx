"use client";

import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlsPanel } from "@/components/controls-panel";
import { DownloadZip } from "@/components/download-zip";
import { DropTarget, SourceButton, SourceChip } from "@/components/drop-zone";
import { DyeTotals } from "@/components/dye-totals";
import { GitHubStarButton } from "@/components/github-star-button";
import { PreviewView } from "@/components/preview-view";
import { TileViewer } from "@/components/tile-viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { loadItemTextures } from "@/lib/image";
import { loadPaletteFromUrl } from "@/lib/palette";
import {
  type PipelineResult,
  resolveAspect,
  runPipeline,
} from "@/lib/pipeline";
import {
  clearSourceFile,
  loadSourceFile,
  saveSourceFile,
} from "@/lib/source-cache";
import { DEFAULT_ADJUSTMENTS, type Palette, type PipelineSettings } from "@/lib/types";

const DEFAULT_SETTINGS: PipelineSettings = {
  gridW: 4,
  gridH: 4,
  tileSize: 32,
  cellSize: 32,
  previewScale: 4,
  texturePadding: 0.2,
  tileBorder: 2,
  cellBorder: 1,
  rulerMargin: 24,
  dither: "none",
  metric: "luma-hue",
  clickBias: 0,
  gammaDither: false,
  fit: "fill",
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  guide: false,
  combined: false,
};

export default function Home() {
  const [palette, setPalette] = useState<Palette | null>(null);
  const [textures, setTextures] = useState<Map<string, ImageBitmap> | null>(
    null,
  );
  const [assetError, setAssetError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sourceSize, setSourceSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [settings, setSettings] = useState<PipelineSettings>(DEFAULT_SETTINGS);
  const [aspectAuto, setAspectAuto] = useState(false);

  const [result, setResult] = useState<PipelineResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load palette + textures once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await loadPaletteFromUrl("/palette.csv");
        if (cancelled) return;
        setPalette(p);
        const t = await loadItemTextures(p);
        if (cancelled) return;
        setTextures(t as Map<string, ImageBitmap>);
      } catch (e) {
        if (!cancelled)
          setAssetError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the most recently uploaded image on page load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadSourceFile();
      if (!cancelled && cached) setFile(cached);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePickFile = useCallback((f: File | null) => {
    setFile(f);
    if (f) void saveSourceFile(f);
    else void clearSourceFile();
  }, []);

  // Capture source image natural dimensions for aspect-auto.
  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourceSize(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const bmp = await createImageBitmap(file);
        if (!cancelled) setSourceSize({ w: bmp.width, h: bmp.height });
        bmp.close();
      } catch {
        /* ignore; runPipeline will surface any error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Effective settings applying aspect-auto.
  const effective = useMemo<PipelineSettings>(() => {
    if (!aspectAuto || !sourceSize) return settings;
    const { gridW, gridH } = resolveAspect(
      sourceSize.w,
      sourceSize.h,
      settings.gridW,
      settings.gridH,
      true,
    );
    return { ...settings, gridW, gridH };
  }, [aspectAuto, sourceSize, settings]);

  // Debounced pipeline runs. Inlined into the effect so React Compiler can
  // see the full external-sync lifecycle.
  const runSeq = useRef(0);
  useEffect(() => {
    if (!file || !palette) return;
    const seq = ++runSeq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunning(true);
    setRunError(null);
    const handle = setTimeout(async () => {
      try {
        const res = await runPipeline(file, palette, effective);
        if (seq !== runSeq.current) return;
        setResult(res);
      } catch (e) {
        if (seq !== runSeq.current) return;
        setRunError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === runSeq.current) setRunning(false);
      }
    }, 120);
    return () => clearTimeout(handle);
  }, [file, palette, effective]);

  const outputStatus: React.ReactNode = (() => {
    if (!file) return null;
    if (!palette || !textures)
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading palette
        </span>
      );
    if (running)
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Processing
        </span>
      );
    return null;
  })();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2">
          <div className="mr-2 flex items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight">ArtMapify</h1>
            <p className="hidden text-xs text-muted-foreground md:block">
              Images into Minecraft dye guides
            </p>
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-2">
            {file ? (
              <SourceChip
                onFile={handlePickFile}
                file={file}
                dimensions={sourceSize}
              />
            ) : (
              <SourceButton onFile={handlePickFile} />
            )}
            {outputStatus}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant={settingsOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setSettingsOpen((o) => !o)}
              aria-expanded={settingsOpen}
              aria-controls="settings-panel"
            >
              <SlidersHorizontal />
              Settings
              <ChevronDown
                className={cn(
                  "transition-transform",
                  settingsOpen ? "rotate-180" : "",
                )}
              />
            </Button>
            {result && textures && file ? (
              <DownloadZip
                result={result}
                itemTextures={textures}
                fileName={file.name}
              />
            ) : null}
            <GitHubStarButton owner="Melishy" repo="artmapify" />
          </div>
        </div>

        {settingsOpen ? (
          <div
            id="settings-panel"
            className="border-t bg-muted/30"
          >
            <div className="mx-auto max-w-7xl px-4 py-4">
              <ControlsPanel
                settings={settings}
                aspectAuto={aspectAuto}
                onChange={setSettings}
                onAspectAutoChange={setAspectAuto}
                onReset={() => {
                  setSettings(DEFAULT_SETTINGS);
                  setAspectAuto(false);
                }}
              />
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
        {assetError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Failed to load assets</AlertTitle>
            <AlertDescription>{assetError}</AlertDescription>
          </Alert>
        ) : null}
        {runError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{runError}</AlertDescription>
          </Alert>
        ) : null}

        {!file ? (
          <div className="flex min-h-[70vh] items-center justify-center">
            <DropTarget
              onFile={handlePickFile}
              className="w-full max-w-xl py-16"
            />
          </div>
        ) : !palette || !textures ? (
          <div className="flex min-h-[60vh] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading palette
          </div>
        ) : !result ? (
          <div className="flex min-h-[60vh] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Processing
          </div>
        ) : (
          <Tabs defaultValue="preview" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="guide">Guide</TabsTrigger>
                <TabsTrigger value="dyes">Dye totals</TabsTrigger>
              </TabsList>
              <SourceStats
                sourceSize={sourceSize}
                gridW={effective.gridW}
                gridH={effective.gridH}
                tileSize={effective.tileSize}
              />
            </div>
            <TabsContent value="preview">
              <PreviewView
                tiles={result.tiles}
                gridW={result.settings.gridW}
                gridH={result.settings.gridH}
                tileSize={result.settings.tileSize}
                scale={result.settings.previewScale}
              />
            </TabsContent>
            <TabsContent value="guide">
              <TileViewer
                tiles={result.tiles}
                settings={result.settings}
                itemTextures={textures}
              />
            </TabsContent>
            <TabsContent value="dyes">
              <DyeTotals
                summary={result.summary}
                itemTextures={textures}
              />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-muted-foreground">
          Everything runs in your browser. Nothing is uploaded.
        </div>
      </footer>
    </div>
  );
}

function SourceStats({
  sourceSize,
  gridW,
  gridH,
  tileSize,
}: {
  sourceSize: { w: number; h: number } | null;
  gridW: number;
  gridH: number;
  tileSize: number;
}) {
  const blocksW = gridW * tileSize;
  const blocksH = gridH * tileSize;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
      {sourceSize ? (
        <span>
          Source{" "}
          <span className="font-medium text-foreground">
            {sourceSize.w} x {sourceSize.h}
          </span>
        </span>
      ) : null}
      <span>
        Grid{" "}
        <span className="font-medium text-foreground">
          {gridW} x {gridH}
        </span>
      </span>
      <span>
        Blocks{" "}
        <span className="font-medium text-foreground">
          {blocksW} x {blocksH}
        </span>
      </span>
    </div>
  );
}
