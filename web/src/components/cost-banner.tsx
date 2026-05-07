"use client";

import { Hammer, MousePointerClick, Package } from "lucide-react";
import type { PipelineSummary } from "@/lib/pipeline";

interface Props {
  summary: PipelineSummary;
}

/**
 * Headline build-cost banner. Pulls numbers straight out of the pipeline
 * summary so it stays in lockstep with the dye-totals tab.
 *
 * Click model:
 *   - placement     = 1 dye-tool click per cell (you place every dye once)
 *   - shade adjust  = clickCost(shade) clicks per cell, already summed
 *                     into summary.totalClicks (0 for placed, 1 for
 *                     feather/coal once, 2 for coal twice).
 * The "total clicks" here is therefore totalCells + totalClicks.
 */
export function CostBanner({ summary }: Props) {
  const maps = summary.gridW * summary.gridH;
  const uniqueDyes = summary.byLabel.length;
  const uniqueItems = new Set(summary.byLabel.map((d) => d.base)).size;
  const cells = summary.totalCells;
  const totalClicks = cells + summary.totalClicks;

  return (
    <div className="bg-muted/30 grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-3">
      <Stat
        icon={<Hammer className="size-3.5" />}
        label="Maps"
        value={maps.toLocaleString()}
        sub={`${cells.toLocaleString()} dye cells`}
      />
      <Stat
        icon={<Package className="size-3.5" />}
        label="Unique items"
        value={uniqueItems.toLocaleString()}
        sub={`${uniqueDyes} dye + shade combos`}
      />
      <Stat
        icon={<MousePointerClick className="size-3.5" />}
        label="Total clicks"
        value={totalClicks.toLocaleString()}
        sub={`${cells.toLocaleString()} place + ${summary.totalClicks.toLocaleString()} shade`}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="bg-background text-muted-foreground mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md">
        {icon}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {label}
        </div>
        <div className="text-foreground truncate text-sm font-semibold tabular-nums">
          {value}
        </div>
        {sub ? (
          <div className="text-muted-foreground truncate text-[10px]">
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}
