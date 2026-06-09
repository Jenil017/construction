"use client";

import { StatCard } from "@/components/ui/stat-card";
import { useAttendance } from "@/lib/hooks/use-attendance";
import { Users } from "lucide-react";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dashboard KPI: workers present today (counts half-days) on the active site. */
export function TodayAttendanceCard() {
  const { data, isLoading } = useAttendance({ date: today() });
  const rows = data ?? [];
  const present = rows.filter((r) => r.status === "present" || r.status === "half_day").length;

  return (
    <StatCard
      label="Present Today"
      value={present}
      icon={Users}
      href="/attendance"
      tone="navy"
      loading={isLoading}
      hint={rows.length > 0 ? `of ${rows.length} marked` : "No attendance marked yet"}
    />
  );
}
