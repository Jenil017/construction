"use client";

import { StatCard } from "@/components/ui/stat-card";
import { usePurchases } from "@/lib/hooks/use-purchases";
import { ShoppingCart } from "lucide-react";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dashboard KPI: total purchase amount ordered today on the active site (excludes cancelled). */
export function TodayPurchasesCard() {
  const { data, isLoading } = usePurchases({ dateFrom: today(), dateTo: today() });
  const rows = (data ?? []).filter((p) => p.status !== "cancelled");
  const total = rows.reduce((s, p) => s + p.total, 0);

  return (
    <StatCard
      label="Today's Purchases"
      value={`₹${Math.round(total).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
      icon={ShoppingCart}
      href="/purchases"
      tone="navy"
      loading={isLoading}
      hint={rows.length === 1 ? "1 order today" : `${rows.length} orders today`}
    />
  );
}
