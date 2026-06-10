// Pick a (gridW, gridH) pair that matches a source image's aspect ratio
// while preserving the user-supplied tile budget (gridW * gridH).
// Used by the CLI's --aspect=auto and the web app's auto-aspect toggle.

export interface AspectAutoResult {
  gridW: number;
  gridH: number;
}

export function resolveAspect(
  sourceW: number,
  sourceH: number,
  gridW: number,
  gridH: number,
  aspectAuto: boolean,
): AspectAutoResult {
  if (!aspectAuto) return { gridW, gridH };
  const budget = Math.max(1, gridW * gridH);
  const srcAspect = sourceW / sourceH;
  let bestW = gridW;
  let bestH = gridH;
  let bestDiff = Infinity;
  for (let w = 1; w <= budget; w++) {
    if (budget % w !== 0) continue;
    const h = budget / w;
    const diff = Math.abs(w / h - srcAspect);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestW = w;
      bestH = h;
    }
  }
  return { gridW: bestW, gridH: bestH };
}
