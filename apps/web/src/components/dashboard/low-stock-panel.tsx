"use client";

import { Card } from "@/components/ui/card";
import { useMaterials } from "@/lib/hooks/use-inventory";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Package } from "lucide-react";
import Link from "next/link";

export function LowStockPanel() {
  const { data: materials, isLoading } = useMaterials({ status: "low_stock" });
  const items = materials ?? [];

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-lg transition-colors",
              items.length > 0
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted/50 text-muted-foreground",
            )}
          >
            {items.length > 0 ? (
              <AlertTriangle className="size-3.5" />
            ) : (
              <Package className="size-3.5" />
            )}
          </span>
          <span className="text-sm font-semibold">Low stock</span>
          {items.length > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-amber-500/20 text-[0.62rem] font-bold text-amber-700 dark:text-amber-400">
              {items.length}
            </span>
          )}
        </div>
        <Link
          href="/inventory"
          className="text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          View all →
        </Link>
      </div>

      <div className="mt-3 flex-1">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <CheckCircle2 className="size-7 text-emerald-500/50" />
            <p className="text-sm text-muted-foreground">All materials above reorder level</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.slice(0, 6).map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/6 px-3 py-2 ring-1 ring-amber-400/20"
              >
                <span className="min-w-0 truncate text-sm font-medium">{m.name}</span>
                <span className="shrink-0 whitespace-nowrap text-[0.72rem] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {m.currentStock} {m.unit}
                </span>
              </li>
            ))}
            {items.length > 6 && (
              <li className="pt-0.5 text-center text-xs text-muted-foreground">
                +{items.length - 6} more items
              </li>
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}
