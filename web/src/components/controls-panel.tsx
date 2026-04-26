"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { PipelineSettings } from "@/lib/types";

export interface ControlsPanelProps {
  settings: PipelineSettings;
  aspectAuto: boolean;
  onChange: (next: PipelineSettings) => void;
  onAspectAutoChange: (v: boolean) => void;
  onReset: () => void;
}

export function ControlsPanel(props: ControlsPanelProps) {
  const { settings, aspectAuto, onChange, onAspectAutoChange, onReset } = props;

  const set = <K extends keyof PipelineSettings>(
    key: K,
    value: PipelineSettings[K],
  ) => onChange({ ...settings, [key]: value });

  const setAdj = <K extends keyof PipelineSettings["adjustments"]>(
    key: K,
    value: PipelineSettings["adjustments"][K],
  ) => onChange({ ...settings, adjustments: { ...settings.adjustments, [key]: value } });

  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Section title="Canvas">
          <Row>
            <Field label="Width (tiles)">
              <NumberInput
                value={settings.gridW}
                min={1}
                max={32}
                step={1}
                disabled={aspectAuto}
                onChange={(v) => set("gridW", v)}
              />
            </Field>
            <Field label="Height (tiles)">
              <NumberInput
                value={settings.gridH}
                min={1}
                max={32}
                step={1}
                disabled={aspectAuto}
                onChange={(v) => set("gridH", v)}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Auto aspect" hint="Match image ratio">
              <Switch
                checked={aspectAuto}
                onCheckedChange={(v) => onAspectAutoChange(Boolean(v))}
              />
            </Field>
            <Field label="Fit">
              <SelectEnum
                value={settings.fit}
                onValueChange={(v) =>
                  set("fit", v as PipelineSettings["fit"])
                }
                options={["fill", "cover", "contain"]}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Tile size">
              <NumberInput
                value={settings.tileSize}
                min={4}
                max={64}
                step={1}
                onChange={(v) => set("tileSize", v)}
              />
            </Field>
            <Field label="Preview scale">
              <NumberInput
                value={settings.previewScale}
                min={1}
                max={16}
                step={1}
                onChange={(v) => set("previewScale", v)}
              />
            </Field>
          </Row>
        </Section>

        <Section title="Matching">
          <Field label="Metric">
            <SelectEnum
              value={settings.metric}
              onValueChange={(v) =>
                set("metric", v as PipelineSettings["metric"])
              }
              options={["luma-hue", "redmean", "rgb"]}
            />
          </Field>
          <Field label="Dither">
            <SelectEnum
              value={settings.dither}
              onValueChange={(v) =>
                set("dither", v as PipelineSettings["dither"])
              }
              options={["none", "floyd-steinberg", "burkes", "sierra-lite"]}
            />
          </Field>
          <Field label="Gamma dither" hint="Linear-light error diffusion">
            <Switch
              checked={settings.gammaDither}
              onCheckedChange={(v) => set("gammaDither", Boolean(v))}
            />
          </Field>
          <SliderField
            label={`Click bias: ${settings.clickBias.toFixed(1)}`}
            value={settings.clickBias}
            min={0}
            max={32}
            step={0.5}
            onChange={(v) => set("clickBias", v)}
          />
        </Section>

        <Section title="Adjustments">
          <SliderField
            label={`Brightness: ${settings.adjustments.brightness.toFixed(2)}`}
            value={settings.adjustments.brightness}
            min={0.2}
            max={2}
            step={0.01}
            onChange={(v) => setAdj("brightness", v)}
          />
          <SliderField
            label={`Contrast: ${settings.adjustments.contrast.toFixed(2)}`}
            value={settings.adjustments.contrast}
            min={0.2}
            max={2}
            step={0.01}
            onChange={(v) => setAdj("contrast", v)}
          />
          <SliderField
            label={`Saturation: ${settings.adjustments.saturation.toFixed(2)}`}
            value={settings.adjustments.saturation}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => setAdj("saturation", v)}
          />
          <SliderField
            label={`Sharpness: ${settings.adjustments.sharpness.toFixed(2)}`}
            value={settings.adjustments.sharpness}
            min={0.3}
            max={2}
            step={0.01}
            onChange={(v) => setAdj("sharpness", v)}
          />
          <Field label="Filter">
            <SelectEnum
              value={settings.adjustments.filter}
              onValueChange={(v) =>
                setAdj(
                  "filter",
                  v as PipelineSettings["adjustments"]["filter"],
                )
              }
              options={["none", "grayscale", "sepia"]}
            />
          </Field>
        </Section>

        <Section title="Guide rendering">
          <Row>
            <Field label="Cell size">
              <NumberInput
                value={settings.cellSize}
                min={8}
                max={128}
                step={1}
                onChange={(v) => set("cellSize", v)}
              />
            </Field>
            <Field label="Ruler margin">
              <NumberInput
                value={settings.rulerMargin}
                min={0}
                max={80}
                step={1}
                onChange={(v) => set("rulerMargin", v)}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Tile border">
              <NumberInput
                value={settings.tileBorder}
                min={0}
                max={10}
                step={1}
                onChange={(v) => set("tileBorder", v)}
              />
            </Field>
            <Field label="Cell border">
              <NumberInput
                value={settings.cellBorder}
                min={0}
                max={10}
                step={1}
                onChange={(v) => set("cellBorder", v)}
              />
            </Field>
          </Row>
          <SliderField
            label={`Texture padding: ${settings.texturePadding.toFixed(2)}`}
            value={settings.texturePadding}
            min={0}
            max={0.45}
            step={0.01}
            onChange={(v) => set("texturePadding", v)}
          />
          <Row>
            <Field label="Emit guides" hint="Per-tile PNGs">
              <Switch
                checked={settings.guide}
                onCheckedChange={(v) => set("guide", Boolean(v))}
              />
            </Field>
            <Field label="Combined" hint="Stitched canvas">
              <Switch
                checked={settings.combined}
                onCheckedChange={(v) => set("combined", Boolean(v))}
              />
            </Field>
          </Row>
        </Section>
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw />
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint ? (
        <p className="text-[11px] text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <Input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] ?? value : v)}
      />
    </div>
  );
}

function SelectEnum({
  value,
  onValueChange,
  options,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(String(v))}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
