"use client";

import { StatCard } from "@/components/ui/stat-card";
import { useSales } from "@/lib/hooks/use-selling";
import { TrendingUp } from "lucide-react";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dashboard KPI: total sale amount recorded today on the active site (excludes cancelled). */
export function TodaySalesCard() {
  const { data, isLoading } = useSales({ dateFrom: today(), dateTo: today() });
  const rows = (data ?? []).filter((s) => s.status !== "cancelled");
  const total = rows.reduce((sum, s) => sum + s.totalAmount, 0);

  return (
    <StatCard
      label="Today's Sales"
      value={`₹${Math.round(total).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
      icon={TrendingUp}
      href="/selling"
      tone="emerald"
      loading={isLoading}
      hint={rows.length === 1 ? "1 sale today" : `${rows.length} sales today`}
    />
  );
}
