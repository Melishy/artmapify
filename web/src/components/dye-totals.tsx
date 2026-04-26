"use client";

import { Badge } from "@/components/ui/badge";
import { CanvasView } from "./canvas-view";
import type { PipelineSummary } from "@/lib/pipeline";

interface Props {
  summary: PipelineSummary;
  itemTextures: Map<string, ImageBitmap>;
}

export function DyeTotals({ summary, itemTextures }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{summary.totalCells} cells</Badge>
        <Badge variant="outline">{summary.totalClicks} clicks</Badge>
        <Badge variant="outline">
          {summary.gridW} x {summary.gridH} tiles
        </Badge>
      </div>
      <div className="max-h-[70vh] min-h-[28rem] overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-2 py-1.5 text-left">Item</th>
              <th className="px-2 py-1.5 text-left">Color</th>
              <th className="px-2 py-1.5 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {summary.byLabel.map((d) => {
              const [r, g, b] = d.rgb;
              const bg = `rgb(${r},${g},${b})`;
              const fg = pickContrastColor(r, g, b);
              const texture = itemTextures.get(d.base) ?? null;
              return (
                <tr key={d.label} className="border-t">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="size-6 overflow-hidden rounded-sm border bg-muted">
                        {texture ? (
                          <CanvasView
                            source={texture}
                            className="block h-full w-full object-contain"
                            alt={d.name}
                          />
                        ) : null}
                      </div>
                      <span className="text-xs">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className="inline-block rounded-sm border px-2 py-0.5 font-mono text-[11px] leading-none"
                      style={{ backgroundColor: bg, color: fg }}
                      title={bg}
                    >
                      {d.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {d.count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Returns "#000" or "#fff" based on relative luminance of the given sRGB color.
 * Uses the WCAG formula so the chosen text color stays readable on the swatch.
 */
function pickContrastColor(r: number, g: number, b: number): string {
  const lum = relativeLuminance(r, g, b);
  return lum > 0.5 ? "#000" : "#fff";
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
