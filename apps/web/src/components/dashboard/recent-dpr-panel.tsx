"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { type DprStatus, useDprList } from "@/lib/hooks/use-dpr";
import { cn } from "@/lib/utils";
import { CheckCircle2, ClipboardList, Clock, Plus } from "lucide-react";
import Link from "next/link";

interface StatusConfig {
  variant: "outline" | "warning" | "success";
  icon: React.ElementType;
  label: string;
}

const STATUS_CONFIG: Record<DprStatus, StatusConfig> = {
  submitted: { variant: "warning", icon: Clock, label: "Pending" },
  approved: { variant: "success", icon: CheckCircle2, label: "Locked" },
};

function formatDprDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function RecentDprPanel() {
  const { data: dprs, isLoading } = useDprList();
  const entries = (dprs ?? []).slice(0, 5);
  const pendingCount = (dprs ?? []).filter((d) => d.status === "submitted").length;

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="size-3.5" />
          </span>
          <span className="text-sm font-semibold">Daily progress</span>
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-[2.5rem] items-center justify-center rounded-full bg-warning/20 px-1.5 text-[0.62rem] font-bold text-amber-700 dark:text-amber-400">
              {pendingCount} pending
            </span>
          )}
        </div>
        <Link
          href="/dpr?new=1"
          className="flex items-center gap-0.5 text-xs text-primary transition-colors hover:text-primary/80"
        >
          <Plus className="size-3" />
          New
        </Link>
      </div>

      <div className="mt-3 flex-1 space-y-1.5">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-[3.25rem] animate-pulse rounded-lg bg-muted/30" />
          ))
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <ClipboardList className="size-7 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No DPR entries yet</p>
          </div>
        ) : (
          entries.map((dpr) => {
            // Fall back gracefully for any unexpected/legacy status (e.g. a pre-migration "draft").
            const cfg = STATUS_CONFIG[dpr.status] ?? STATUS_CONFIG.submitted;
            const StatusIcon = cfg.icon;
            const displayText =
              dpr.workCategory ?? dpr.completedWork ?? dpr.location ?? "Daily progress report";

            return (
              <div
                key={dpr.id}
                className="flex items-start gap-2.5 rounded-lg border border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/30"
              >
                <StatusIcon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    dpr.status === "approved"
                      ? "text-emerald-500"
                      : dpr.status === "submitted"
                        ? "text-amber-500"
                        : "text-muted-foreground/40",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.7rem] text-muted-foreground">
                      {formatDprDate(dpr.reportDate)}
                    </span>
                    <Badge variant={cfg.variant} className="px-1.5 py-0 text-[0.6rem]">
                      {cfg.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-foreground/85">
                    {displayText}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {(dprs?.length ?? 0) > 5 && (
        <Link
          href="/dpr"
          className="mt-3 block border-t border-border/50 pt-2.5 text-center text-xs text-primary transition-colors hover:text-primary/80"
        >
          View all reports →
        </Link>
      )}
    </Card>
  );
}
