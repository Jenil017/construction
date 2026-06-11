"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export interface BarData {
  label: string;
  value: number;
  isHighlight?: boolean;
}

interface MiniBarChartProps {
  bars: BarData[];
  className?: string;
  maxHeight?: number;
}

export function MiniBarChart({ bars, className, maxHeight = 52 }: MiniBarChartProps) {
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
          <div key={`${bar.label}-${i}`} className="group flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                "w-full rounded-t-[3px] transition-[height] ease-out",
                bar.value === 0
                  ? "bg-muted/20"
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
