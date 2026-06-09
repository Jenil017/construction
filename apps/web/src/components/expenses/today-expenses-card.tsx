"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExpenses } from "@/lib/hooks/use-expenses";
import Link from "next/link";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dashboard KPI: total expense amount recorded today on the active site. */
export function TodayExpensesCard() {
  const { data, isLoading } = useExpenses({ dateFrom: today(), dateTo: today() });
  const total = (data ?? []).reduce((s, e) => s + e.amount, 0);

  return (
    <Link href="/expenses" className="block rounded-xl transition-opacity hover:opacity-90">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Today Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums">
            {isLoading ? "—" : `₹${total.toLocaleString("en-IN")}`}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
