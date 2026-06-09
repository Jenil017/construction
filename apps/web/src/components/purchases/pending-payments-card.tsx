"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePurchases } from "@/lib/hooks/use-purchases";
import Link from "next/link";

/** Dashboard KPI: outstanding supplier balance across active purchases on the site. */
export function PendingPaymentsCard() {
  const { data, isLoading } = usePurchases();
  const outstanding = (data ?? [])
    .filter((p) => p.status !== "cancelled" && p.paymentStatus !== "paid")
    .reduce((s, p) => s + Math.max(p.total - p.amountPaid, 0), 0);

  return (
    <Link href="/purchases" className="block rounded-xl transition-opacity hover:opacity-90">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pending Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-semibold tabular-nums ${outstanding > 0 ? "text-warning" : ""}`}
          >
            {isLoading ? "—" : `₹${outstanding.toLocaleString("en-IN")}`}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
