import type { PipelineSettings } from "./types";

/**
 * Named presets that nudge the pipeline toward a particular kind of input.
 * Each preset only overrides the fields that matter for the kind; canvas
 * size, output flags, etc. are left alone so toggling a preset doesn't
 * surprise the user mid-edit.
 */
export interface Preset {
  id: string;
  label: string;
  description: string;
  /** Partial settings to merge into current settings on apply. */
  apply: (current: PipelineSettings) => PipelineSettings;
}

const merge = (
  current: PipelineSettings,
  overrides: Partial<PipelineSettings>,
): PipelineSettings => ({
  ...current,
  ...overrides,
  adjustments: {
    ...current.adjustments,
    ...(overrides.adjustments ?? {}),
  },
});

export const PRESETS: Preset[] = [
  {
    id: "photo",
    label: "Photo",
    description:
      "Floyd-Steinberg dither, luma-hue match, slight contrast bump. Good default for camera shots and renders.",
    apply: (s) =>
      merge(s, {
        dither: "floyd-steinberg",
        gammaDither: true,
        metric: "luma-hue",
        clickBias: 0,
        adjustments: {
          ...s.adjustments,
          contrast: 1.08,
          saturation: 1,
          sharpness: 1,
          filter: "none",
        },
      }),
  },
  {
    id: "pixel-art",
    label: "Pixel art",
    description:
      "No dither, plain RGB match. Preserves crisp edges and existing palettes; best on already-quantized art.",
    apply: (s) =>
      merge(s, {
        dither: "none",
        gammaDither: false,
        metric: "rgb",
        clickBias: 0,
        fit: "cover",
        adjustments: {
          ...s.adjustments,
          brightness: 1,
          contrast: 1,
          saturation: 1,
          sharpness: 1,
          filter: "none",
        },
      }),
  },
  {
    id: "logo",
    label: "Logo",
    description:
      "Strong click-bias toward placed shades, no dither, luma-hue. Fewer in-game clicks at the cost of fine gradients.",
    apply: (s) =>
      merge(s, {
        dither: "none",
        metric: "luma-hue",
        clickBias: 12,
        adjustments: {
          ...s.adjustments,
          contrast: 1.1,
          saturation: 1.05,
        },
      }),
  },
  {
    id: "high-contrast",
    label: "High contrast",
    description:
      "Push contrast and saturation, redmean match. Good for bold posters and silhouettes.",
    apply: (s) =>
      merge(s, {
        dither: "none",
        metric: "redmean",
        clickBias: 0,
        adjustments: {
          ...s.adjustments,
          contrast: 1.35,
          saturation: 1.2,
          sharpness: 1.1,
          filter: "none",
        },
      }),
  },
];
