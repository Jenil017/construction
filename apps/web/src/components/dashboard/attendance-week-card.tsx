"use client";

import { Card } from "@/components/ui/card";
import { useAttendance, useWorkers } from "@/lib/hooks/use-attendance";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
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

export function AttendanceWeekCard() {
  const days = getLast7();
  const { data: workers } = useWorkers();
  const { data: attendance, isLoading } = useAttendance({
    dateFrom: days.at(0)?.date,
    dateTo: days.at(-1)?.date,
  });

  const [progressMounted, setProgressMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setProgressMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const totalWorkers = workers?.length ?? 0;

  const byDate = new Map<string, number>();
  for (const r of attendance ?? []) {
    const inc = r.status === "half_day" ? 0.5 : r.status === "present" ? 1 : 0;
    if (inc > 0) byDate.set(r.attendanceDate, (byDate.get(r.attendanceDate) ?? 0) + inc);
  }

  const bars = days.map((d) => ({ ...d, value: byDate.get(d.date) ?? 0 }));
  const todayDate = days.at(-1)?.date ?? "";
  const todayPresent = Math.round(bars.at(-1)?.value ?? 0);
  const todayMarked = (attendance ?? []).filter((r) => r.attendanceDate === todayDate).length;
  const pct = totalWorkers > 0 ? Math.round((todayPresent / totalWorkers) * 100) : null;
  const avgPresent = bars.reduce((s, b) => s + b.value, 0) / 7;

  return (
    <Link
      href="/attendance"
      className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <Card className="h-full cursor-pointer p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-muted-foreground">
              Attendance · today
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-semibold leading-none tracking-tight tabular-nums sm:text-[1.65rem]">
                {isLoading ? <span className="text-muted-foreground/30">—</span> : todayPresent}
              </span>
              {!isLoading && totalWorkers > 0 && (
                <span className="text-base font-medium text-muted-foreground">
                  / {totalWorkers}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {isLoading
                ? "Loading…"
                : todayMarked === 0
                  ? "No attendance marked yet"
                  : pct !== null
                    ? `${pct}% on site · avg ${avgPresent.toFixed(1)}/day`
                    : `${todayMarked} workers marked`}
            </p>
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-[1.1rem]" />
          </span>
        </div>

        {!isLoading && totalWorkers > 0 && pct !== null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/30">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-out",
                pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-primary" : "bg-danger",
              )}
              style={{ width: progressMounted ? `${pct}%` : "0%" }}
            />
          </div>
        )}

        <div className="mt-3">
          <MiniBarChart bars={bars} maxHeight={50} />
        </div>
      </Card>
    </Link>
  );
}
