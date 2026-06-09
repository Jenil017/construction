"use client";

import { StatCard } from "@/components/ui/stat-card";
import { useMaterials } from "@/lib/hooks/use-inventory";
import { PackageX } from "lucide-react";

/** Dashboard KPI: count of materials at/below their reorder level on the active site. */
export function LowStockCard() {
  const { data, isLoading } = useMaterials({ status: "low_stock" });
  const count = data?.length ?? 0;

  return (
    <StatCard
      label="Low Stock Items"
      value={count}
      icon={PackageX}
      href="/inventory"
      tone={count > 0 ? "amber" : "navy"}
      emphasize={count > 0}
      loading={isLoading}
      hint={count > 0 ? "Needs reordering" : "All above reorder level"}
    />
  );
}
