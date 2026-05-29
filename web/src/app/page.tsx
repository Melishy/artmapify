"use client";

import { DEFAULT_SUFFIX_TEMPLATE, loadBuiltinPalette } from "@artmapify/core";
import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArtMapExport } from "@/components/artmap-export";
import { CostBanner } from "@/components/cost-banner";
import { DownloadZip } from "@/components/download-zip";
import { DropTarget, SourceButton, SourceChip } from "@/components/drop-zone";
import { DyeTotals } from "@/components/dye-totals";
import { GitHubStarButton } from "@/components/github-star-button";
import { KoFiButton } from "@/components/ko-fi-button";
import { PreviewView } from "@/components/preview-view";
import { SettingsPopover } from "@/components/settings-popover";
import { TileViewer } from "@/components/tile-viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { withBasePath } from "@/lib/base-path";
import { loadItemTextures } from "@/lib/image";
import { type PipelineResult, resolveAspect } from "@/lib/pipeline";
import { PipelineClient } from "@/lib/pipeline-client";
import { loadCachedSettings, saveCachedSettings } from "@/lib/settings-cache";
import {
  clearSourceFile,
  loadSourceFile,
  saveSourceFile,
} from "@/lib/source-cache";
import {
  DEFAULT_ADJUSTMENTS,
  type Palette,
  type PipelineSettings,
} from "@/lib/types";
import { usePasteImageListener } from "@/lib/use-clipboard-image";
import { cn } from "@/lib/utils";

const DEFAULT_SETTINGS: PipelineSettings = {
  gridW: 3,
  gridH: 3,
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
  // Settings start at defaults and get hydrated from localStorage in an
  // effect (not during render) so SSR HTML matches the first client paint.
  const [settings, setSettings] = useState<PipelineSettings>(DEFAULT_SETTINGS);
  const [aspectAuto, setAspectAuto] = useState(false);

  const [result, setResult] = useState<PipelineResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ArtMap import-JSON metadata. Kept at page-level (not inside
  // PipelineSettings) because they don't affect the rendered tiles.
  const [artmapTitle, setArtmapTitle] = useState("");
  const [artmapArtist, setArtmapArtist] = useState("");
  // Per-tile suffix template. Default mirrors core's DEFAULT_SUFFIX_TEMPLATE
  // so the input shows the real default; clearing it ("") disables
  // suffixing entirely.
  const [artmapSuffix, setArtmapSuffix] = useState<string>(
    DEFAULT_SUFFIX_TEMPLATE,
  );
  // Track whether we've hydrated from cache yet, so the persistence
  // effect below doesn't overwrite the cache with default values
  // immediately after mount.
  const hydratedRef = useRef(false);

  // Hydrate persisted state from localStorage after mount.
  useEffect(() => {
    const cached = loadCachedSettings();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached.settings)
      setSettings({ ...DEFAULT_SETTINGS, ...cached.settings });
    if (cached.aspectAuto !== undefined) setAspectAuto(cached.aspectAuto);
    if (cached.artmapTitle !== undefined) setArtmapTitle(cached.artmapTitle);
    if (cached.artmapArtist !== undefined) setArtmapArtist(cached.artmapArtist);
    if (cached.artmapSuffix !== undefined) setArtmapSuffix(cached.artmapSuffix);
    /* eslint-enable react-hooks/set-state-in-effect */
    hydratedRef.current = true;
  }, []);

  // Persist settings on every change once hydrated.
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveCachedSettings({
      settings,
      aspectAuto,
      artmapTitle,
      artmapArtist,
      artmapSuffix,
    });
  }, [settings, aspectAuto, artmapTitle, artmapArtist, artmapSuffix]);

  // Load palette synchronously from the bundled @artmapify/core copy,
  // then async-load the item textures from /items/.
  useEffect(() => {
    let cancelled = false;
    try {
      const p = loadBuiltinPalette();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPalette(p);
      (async () => {
        try {
          const t = await loadItemTextures(p);
          if (cancelled) return;
          setTextures(t as Map<string, ImageBitmap>);
        } catch (e) {
          if (!cancelled)
            setAssetError(e instanceof Error ? e.message : String(e));
        }
      })();
    } catch (e) {
      setAssetError(e instanceof Error ? e.message : String(e));
    }
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

  // Paste from clipboard, anywhere on the page.
  usePasteImageListener(
    useCallback((f: File) => handlePickFile(f), [handlePickFile]),
  );

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

  // Debounced pipeline runs, dispatched to a Web Worker so the main
  // thread stays responsive even on big grids with dither enabled.
  // The worker is reused across runs; stale runs are filtered out via
  // a monotonic seq counter rather than terminating the worker.
  const runSeq = useRef(0);
  const clientRef = useRef<PipelineClient | null>(null);
  // Spawn the worker on mount, terminate on unmount. Effects below read
  // clientRef.current; if it ever sees null they early-return (the very
  // first paint runs before this effect, so that's a normal state).
  useEffect(() => {
    clientRef.current = new PipelineClient();
    return () => {
      clientRef.current?.terminate();
      clientRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!file || !palette) return;
    const seq = ++runSeq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunning(true);
    setRunError(null);
    const handle = setTimeout(async () => {
      const client = clientRef.current;
      if (!client) return;
      try {
        const res = await client.run(file, effective);
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
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" />
          Loading palette
        </span>
      );
    if (running)
      return (
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" />
          Processing
        </span>
      );
    return null;
  })();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-nowrap items-center gap-2 px-4 py-2">
          <div className="mr-2 flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={withBasePath("/artmapify.ico")}
              alt=""
              aria-hidden
              className="size-5 shrink-0"
              style={{ imageRendering: "pixelated" }}
            />
            <h1 className="text-lg font-semibold tracking-tight">ArtMapify</h1>
            <p className="text-muted-foreground hidden text-xs md:block">
              Images into Minecraft dye guides
            </p>
          </div>

          <div className="flex min-w-0 flex-1 shrink items-center gap-2">
            {file ? (
              <SourceChip
                onFile={handlePickFile}
                onClear={() => handlePickFile(null)}
                file={file}
                dimensions={sourceSize}
              />
            ) : (
              <SourceButton onFile={handlePickFile} />
            )}
            {outputStatus}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={settingsOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setSettingsOpen((o) => !o)}
              aria-expanded={settingsOpen}
              aria-controls="settings-panel"
              title="Settings"
              aria-label="Settings"
            >
              <SlidersHorizontal />
              <span className="hidden lg:inline">Settings</span>
              <ChevronDown
                className={cn(
                  "transition-transform",
                  settingsOpen ? "rotate-180" : "",
                )}
              />
            </Button>
            {/* Non-essential links collapse first on tiny screens: Ko-fi
             * hides below 400px, GitHub below 480px, so the core buttons
             * always fit without overlapping. */}
            <span className="hidden min-[400px]:inline-flex">
              <KoFiButton username="melishy" />
            </span>
            <span className="hidden min-[480px]:inline-flex">
              <GitHubStarButton owner="Melishy" repo="artmapify" />
            </span>
          </div>
        </div>
      </header>
      <SettingsPopover
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        aspectAuto={aspectAuto}
        onChange={setSettings}
        onAspectAutoChange={setAspectAuto}
        onReset={() => {
          setSettings(DEFAULT_SETTINGS);
          setAspectAuto(false);
        }}
      />

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
          <div className="bg-muted/30 text-muted-foreground flex min-h-[60vh] items-center justify-center rounded-lg border text-sm">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading palette
          </div>
        ) : !result ? (
          <div className="bg-muted/30 text-muted-foreground flex min-h-[60vh] items-center justify-center rounded-lg border text-sm">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Processing
          </div>
        ) : (
          <Tabs defaultValue="preview" className="space-y-3">
            <CostBanner summary={result.summary} />
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="guide">Guide</TabsTrigger>
              <TabsTrigger value="dyes">Dye totals</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>
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
              <DyeTotals summary={result.summary} itemTextures={textures} />
            </TabsContent>
            <TabsContent value="export">
              <div className="bg-muted/30 space-y-6 rounded-lg border p-4">
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">ArtMap import</h2>
                    <p className="text-muted-foreground text-xs">
                      Skip the painting step entirely. Generates a JSON file you
                      drop into your ArtMap server&apos;s plugin folder and
                      import with{" "}
                      <code className="bg-background rounded px-1 py-0.5 font-mono text-[10px]">
                        /art import
                      </code>
                      .
                    </p>
                  </div>
                  <ArtMapExport
                    result={result}
                    fileName={file.name}
                    title={artmapTitle}
                    onTitleChange={setArtmapTitle}
                    artist={artmapArtist}
                    onArtistChange={setArtmapArtist}
                    suffixTemplate={artmapSuffix}
                    onSuffixTemplateChange={setArtmapSuffix}
                  />
                </section>

                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">
                    Build guides + preview
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    Per-tile guide images, optional combined canvas, preview,
                    and a summary JSON. Bundled into a single zip ready to print
                    or open on a second monitor.
                  </p>
                  {textures ? (
                    <DownloadZip
                      result={result}
                      itemTextures={textures}
                      fileName={file.name}
                      artmapTitle={artmapTitle}
                      artmapArtist={artmapArtist}
                      artmapSuffix={artmapSuffix}
                    />
                  ) : null}
                </section>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto max-w-7xl px-4 py-3 text-xs">
          Everything runs in your browser. Nothing is uploaded.
        </div>
      </footer>
    </div>
  );
}
