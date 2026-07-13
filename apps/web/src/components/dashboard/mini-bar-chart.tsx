"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export interface BarData {
  label: string;
  value: number;
  isHighlight?: boolean;
  /** Optional fuller label for the hover tooltip (e.g. a full date). Falls back to `label`. */
  tooltipLabel?: string;
}

interface MiniBarChartProps {
  bars: BarData[];
  className?: string;
  maxHeight?: number;
  /** Formats a bar's value for the hover tooltip (e.g. `₹1,200` or `36 present`). */
  formatValue?: (value: number) => string;
}

export function MiniBarChart({
  bars,
  className,
  maxHeight = 52,
  formatValue = (v) => String(v),
}: MiniBarChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const maxVal = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div
      className={cn("flex items-end gap-[3px]", className)}
      style={{ height: `${maxHeight + 18}px` }}
    >
      {bars.map((bar, i) => {
        const h = bar.value > 0 ? Math.max((bar.value / maxVal) * maxHeight, 3) : 0;
        return (
          <div
            key={`${bar.label}-${i}`}
            className="group relative flex flex-1 flex-col items-center gap-1"
          >
            {/* Hover tooltip: shows the day + its value. Pointer-events-none so it never
                blocks the bar; positioned above and clamped inside the card by the parent. */}
            <div
              className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[0.6rem] font-medium leading-tight text-background opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100"
              role="tooltip"
            >
              <span className="block font-semibold">{bar.tooltipLabel ?? bar.label}</span>
              <span className="block tabular-nums">{formatValue(bar.value)}</span>
            </div>
            <div
              className={cn(
                "w-full rounded-t-[3px] transition-[height] ease-out",
                bar.value === 0
                  ? "bg-muted/20 group-hover:bg-muted/40"
                  : bar.isHighlight
                    ? "bg-primary"
                    : "bg-primary/30 group-hover:bg-primary/55",
              )}
              style={{
                height: mounted ? `${h}px` : "0px",
                transitionDuration: "700ms",
                transitionDelay: `${i * 45}ms`,
              }}
            />
            <span
              className={cn(
                "text-[0.55rem] font-medium leading-none tracking-wide",
                bar.isHighlight ? "font-bold text-foreground" : "text-muted-foreground/50",
              )}
            >
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
