"use client";

import { Card } from "@/components/ui/card";
import { useExpenses } from "@/lib/hooks/use-expenses";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Receipt } from "lucide-react";
import Link from "next/link";
import { MiniBarChart } from "./mini-bar-chart";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getLast7() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return {
      date: d.toISOString().slice(0, 10),
      label: DAY_LABELS[d.getDay()] ?? "?",
      isHighlight: i === 6,
    };
  });
}

export function ExpenseWeekCard() {
  const days = getLast7();
  const { data: expenses, isLoading } = useExpenses({
    dateFrom: days.at(0)?.date,
    dateTo: days.at(-1)?.date,
  });

  const byDate = new Map<string, number>();
  for (const e of expenses ?? []) {
    byDate.set(e.expenseDate, (byDate.get(e.expenseDate) ?? 0) + e.amount);
  }

  const bars = days.map((d) => ({ ...d, value: byDate.get(d.date) ?? 0 }));
  const weekTotal = bars.reduce((s, b) => s + b.value, 0);
  const todayTotal = bars.at(-1)?.value ?? 0;
  const yesterdayTotal = bars.at(-2)?.value ?? 0;
  const trendPct =
    yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : null;

  return (
    <Link
      href="/expenses"
      className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <Card className="h-full cursor-pointer p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-muted-foreground">
              Expenses · 7 days
            </p>
            <p className="mt-2 text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums">
              {isLoading ? (
                <span className="text-muted-foreground/30">—</span>
              ) : (
                `₹${weekTotal.toLocaleString("en-IN")}`
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-muted-foreground">
                Today:&nbsp;
                <span className="font-semibold text-foreground/80">
                  {isLoading ? "—" : `₹${todayTotal.toLocaleString("en-IN")}`}
                </span>
              </span>
              {!isLoading && trendPct !== null && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[0.7rem] font-semibold",
                    trendPct > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {trendPct > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {Math.abs(trendPct).toFixed(0)}% vs yesterday
                </span>
              )}
            </div>
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
            <Receipt className="size-[1.1rem]" />
          </span>
        </div>

        <div className="mt-4">
          <MiniBarChart bars={bars} maxHeight={54} />
        </div>
      </Card>
    </Link>
  );
}
