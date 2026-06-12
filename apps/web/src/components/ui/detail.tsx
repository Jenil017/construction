import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Indian-format rupee amount, e.g. ₹3,00,000 / ₹2,50,000.50. */
export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

type Tone = "default" | "danger" | "success" | "primary";

const TONE: Record<Tone, string> = {
  default: "",
  danger: "text-danger",
  success: "text-success",
  primary: "text-primary",
};

export interface StatTile {
  label: string;
  value: ReactNode;
  tone?: Tone;
}

/**
 * A compact grid of label/value tiles for a record's headline figures — e.g.
 * Total / Received / Outstanding. Mobile-first (2-up on phones, 3-up on ≥sm).
 */
export function StatTiles({ items }: { items: StatTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((s) => (
        <div key={s.label} className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className={cn("truncate font-semibold tabular-nums", TONE[s.tone ?? "default"])}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export interface DetailRow {
  label: string;
  value: ReactNode;
  /** Drop the row when the value is null/undefined/empty (e.g. "" or "—"). */
  hideEmpty?: boolean;
}

/**
 * A definition list (label on the left, value on the right) that wraps cleanly
 * on small screens — the canonical body for a record detail modal.
 */
export function DetailRows({ rows }: { rows: DetailRow[] }) {
  const visible = rows.filter(
    (r) => !(r.hideEmpty && (r.value == null || r.value === "" || r.value === "—")),
  );
  return (
    <dl className="divide-y divide-border/60 overflow-hidden rounded-lg border">
      {visible.map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
          <dt className="shrink-0 text-sm text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 break-words text-right text-sm font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
