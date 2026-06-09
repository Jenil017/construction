"use client";

import { StatCard } from "@/components/ui/stat-card";
import { usePurchases } from "@/lib/hooks/use-purchases";
import { Wallet } from "lucide-react";

/** Dashboard KPI: outstanding supplier balance across active purchases on the site. */
export function PendingPaymentsCard() {
  const { data, isLoading } = usePurchases();
  const outstanding = (data ?? [])
    .filter((p) => p.status !== "cancelled" && p.paymentStatus !== "paid")
    .reduce((s, p) => s + Math.max(p.total - p.amountPaid, 0), 0);

  return (
    <StatCard
      label="Pending Payments"
      value={`₹${outstanding.toLocaleString("en-IN")}`}
      icon={Wallet}
      href="/purchases"
      tone={outstanding > 0 ? "amber" : "navy"}
      emphasize={outstanding > 0}
      loading={isLoading}
      hint="Owed to suppliers"
    />
  );
}
