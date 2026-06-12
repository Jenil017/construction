"use client";

import { MaterialDetailModal } from "@/components/inventory/material-detail-modal";
import { MaterialFormModal } from "@/components/inventory/material-form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterDrawer, type FilterValues } from "@/components/ui/filter-drawer";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import { type Material, useDeleteMaterial, useMaterials } from "@/lib/hooks/use-inventory";
import { useOpenOnParam } from "@/lib/hooks/use-open-on-param";
import { ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

export default function InventoryPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const {
    data: materials,
    isLoading,
    isError,
    refetch,
  } = useMaterials({
    search: search || undefined,
    status: filters.stockStatus === "low_stock" ? "low_stock" : undefined,
  });
  const deleteMaterial = useDeleteMaterial();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canCreate = can("inventory", "create");
  const canDelete = can("inventory", "delete");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useOpenOnParam("new", canCreate, openCreate);
  const openEdit = (material: Material) => {
    setDetailId(null);
    setEditing(material);
    setFormOpen(true);
  };
  const onDelete = async (material: Material) => {
    if (!window.confirm(`Delete "${material.name}"? Its stock ledger is kept.`)) return;
    try {
      await deleteMaterial.mutateAsync(material.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not delete the material.");
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Site-wise material master and stock ledger with low-stock alerts.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="size-4" />
            Add material
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, or category"
            className="pl-8"
          />
        </div>
        <FilterDrawer
          fields={[
            {
              type: "select",
              key: "stockStatus",
              label: "Stock status",
              options: [{ value: "low_stock", label: "Low stock only" }],
            },
          ]}
          values={filters}
          onChange={setFilters}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load materials.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !materials || materials.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No materials found.</div>
        ) : (
          <>
            {/* Mobile: tappable cards (avoids wide-table overflow). */}
            <ul className="divide-y md:hidden">
              {materials.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(m.id)}
                    className="flex w-full items-center gap-3 px-4 pt-3 pb-2 text-left transition-colors active:bg-accent"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{m.name}</span>
                        {m.lowStock ? <Badge variant="warning">Low</Badge> : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {m.currentStock} {m.unit}
                        {m.category ? ` · ${m.category}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop: full table. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-full">Material</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead>Reorder at</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((m) => (
                    <TableRow
                      key={m.id}
                      className="cursor-pointer"
                      onClick={() => setDetailId(m.id)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {m.name}
                          {m.lowStock ? <Badge variant="warning">Low</Badge> : null}
                        </div>
                        {m.sku ? (
                          <span className="text-xs text-muted-foreground">SKU {m.sku}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.category ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.currentStock} {m.unit}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {m.reorderLevel != null ? `${m.reorderLevel} ${m.unit}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailId(m.id);
                            }}
                          >
                            View
                          </Button>
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:text-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(m);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <MaterialFormModal open={formOpen} onClose={() => setFormOpen(false)} material={editing} />
      <MaterialDetailModal
        materialId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
      />
    </div>
  );
}
