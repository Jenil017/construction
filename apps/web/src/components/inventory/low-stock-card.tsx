"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMaterials } from "@/lib/hooks/use-inventory";
import Link from "next/link";

/** Dashboard KPI: count of materials at/below their reorder level on the active site. */
export function LowStockCard() {
  const { data, isLoading } = useMaterials({ status: "low_stock" });
  const count = data?.length ?? 0;

  return (
    <Link href="/inventory" className="block rounded-xl transition-opacity hover:opacity-90">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Low Stock Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-semibold ${count > 0 ? "text-warning" : ""}`}>
            {isLoading ? "—" : count}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
