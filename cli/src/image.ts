// CLI-only sharp-based image preparation. Quantization and tile splitting
// have moved to @artmapify/core; this file owns just the platform-specific
// "load + resize + adjust + filter -> raw RGBA" stage.

import sharp from "sharp";
import type {
  Adjustments,
  DitherMethod,
  FitMode,
  RawImage,
} from "@artmapify/core";

/**
 * Load an image, apply adjustments and filters, resize to the canvas pixel size.
 * Returns a raw RGBA buffer.
 *
 * `fit` controls how the source aspect ratio is handled:
 *   - 'fill' (default, back-compat): stretch to exact canvas size.
 *   - 'cover': fill the canvas and crop overflow (no distortion).
 *   - 'contain': fit inside the canvas with letterbox bars.
 */
export async function prepareImage(
  inputPath: string,
  gridW: number,
  gridH: number,
  tileSize: number,
  adj: Adjustments,
  dither: DitherMethod,
  fit: FitMode = "fill",
): Promise<RawImage> {
  const targetW = gridW * tileSize;
  const targetH = gridH * tileSize;

  let img = sharp(inputPath)
    .removeAlpha()
    .resize(targetW, targetH, {
      kernel: "lanczos3",
      fit,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    });

  // Brightness + saturation via HSL-ish modulation, sharpness via sigma.
  // sharp.modulate: brightness (mult), saturation (mult). No native contrast.
  if (adj.brightness !== 1 || adj.saturation !== 1) {
    img = img.modulate({
      brightness: adj.brightness,
      saturation: adj.saturation,
    });
  }

  // Contrast: linear(a, b) where a=contrast, b=offset shifting midpoint.
  // y = a*x + b. For symmetric contrast about 128: b = 128*(1 - a).
  if (adj.contrast !== 1) {
    img = img.linear(adj.contrast, 128 * (1 - adj.contrast));
  }

  // Sharpness: map 1.0 = no-op, >1 sharpen, <1 blur.
  if (adj.sharpness > 1) {
    img = img.sharpen({ sigma: (adj.sharpness - 1) * 2 });
  } else if (adj.sharpness < 1) {
    img = img.blur(Math.max(0.3, (1 - adj.sharpness) * 2));
  }

  if (adj.filter === "grayscale") {
    img = img.grayscale().toColorspace("srgb");
  } else if (adj.filter === "sepia") {
    // Standard sepia matrix applied via recomb.
    img = img.recomb([
      [0.393, 0.769, 0.189],
      [0.349, 0.686, 0.168],
      [0.272, 0.534, 0.131],
    ]);
  }

  // (intentionally no automatic contrast boost here - crushes dark images
  // into ink_sac. Use --contrast if you want one.)
  void dither;

  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}
