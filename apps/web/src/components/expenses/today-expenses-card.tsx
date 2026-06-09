"use client";

import { StatCard } from "@/components/ui/stat-card";
import { useExpenses } from "@/lib/hooks/use-expenses";
import { Receipt } from "lucide-react";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dashboard KPI: total expense amount recorded today on the active site. */
export function TodayExpensesCard() {
  const { data, isLoading } = useExpenses({ dateFrom: today(), dateTo: today() });
  const rows = data ?? [];
  const total = rows.reduce((s, e) => s + e.amount, 0);

  return (
    <StatCard
      label="Today's Expenses"
      value={`₹${total.toLocaleString("en-IN")}`}
      icon={Receipt}
      href="/expenses"
      tone="teal"
      loading={isLoading}
      hint={rows.length === 1 ? "1 entry today" : `${rows.length} entries today`}
    />
  );
}
