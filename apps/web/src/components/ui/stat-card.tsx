import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Card } from "./card";

export type StatTone = "navy" | "amber" | "emerald" | "rose" | "teal";

const TONE: Record<StatTone, { chip: string; value: string }> = {
  navy: { chip: "bg-primary/10 text-primary", value: "text-foreground" },
  amber: {
    chip: "bg-accent-solid/15 text-accent-foreground",
    value: "text-accent-foreground",
  },
  emerald: { chip: "bg-success/12 text-success", value: "text-success" },
  rose: { chip: "bg-danger/10 text-danger", value: "text-danger" },
  teal: { chip: "bg-teal/10 text-teal", value: "text-teal" },
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: StatTone;
  /** Small caption under the value. */
  hint?: string;
  loading?: boolean;
  /** Tint the value with the tone color (use for "needs attention" stats). */
  emphasize?: boolean;
}

/**
 * Dashboard KPI tile: a tinted icon chip, a muted label, and a large mono figure.
 * When `href` is set the whole tile is a link with a subtle lift + an accent
 * underline that wipes in on hover.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "navy",
  hint,
  loading,
  emphasize,
}: StatCardProps) {
  const t = TONE[tone];
  const inner = (
    <Card
      className={cn(
        "group relative h-full overflow-hidden p-5 transition-all duration-200",
        href && "hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "nums mt-2 truncate text-2xl font-semibold tracking-tight sm:text-[1.7rem]",
              emphasize ? t.value : "text-foreground",
            )}
          >
            {loading ? <span className="text-muted-foreground/40">—</span> : value}
          </p>
          {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t.chip)}
        >
          <Icon className="size-5" />
        </span>
      </div>
      {href ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-solid transition-transform duration-300 group-hover:scale-x-100" />
      ) : null}
    </Card>
  );

  if (!href) return inner;
  return (
    <Link
      href={href}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {inner}
    </Link>
  );
}
