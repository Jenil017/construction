"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAttendance } from "@/lib/hooks/use-attendance";
import Link from "next/link";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dashboard KPI: workers present today (counts half-days) on the active site. */
export function TodayAttendanceCard() {
  const { data, isLoading } = useAttendance({ date: today() });
  const present = (data ?? []).filter(
    (r) => r.status === "present" || r.status === "half_day",
  ).length;

  return (
    <Link href="/attendance" className="block rounded-xl transition-opacity hover:opacity-90">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Today Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{isLoading ? "—" : present}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
