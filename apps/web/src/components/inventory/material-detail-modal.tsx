"use client";

import { MovementFormModal } from "@/components/inventory/movement-form-modal";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type Material,
  type MovementType,
  useDeleteMaterial,
  useMaterial,
} from "@/lib/hooks/use-inventory";
import { Loader2, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

const TYPE_META: Record<MovementType, { label: string; variant: BadgeProps["variant"] }> = {
  inward: { label: "Inward", variant: "success" },
  outward: { label: "Outward", variant: "warning" },
  wastage: { label: "Wastage", variant: "danger" },
  adjustment: { label: "Adjustment", variant: "brand" },
};

interface MaterialDetailModalProps {
  materialId: string | null;
  onClose: () => void;
  onEdit: (material: Material) => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

/** How a single ledger row reads in the movements list. */
function movementAmount(type: MovementType, quantity: number, balanceAfter: number, unit: string) {
  if (type === "adjustment") return `set to ${balanceAfter} ${unit}`;
  const sign = type === "inward" ? "+" : "−";
  return `${sign}${quantity} ${unit}`;
}

export function MaterialDetailModal({ materialId, onClose, onEdit }: MaterialDetailModalProps) {
  const { can } = useAuth();
  const { data: material, isLoading } = useMaterial(materialId);
  const deleteMaterial = useDeleteMaterial();
  const [movementOpen, setMovementOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = can("inventory", "create");
  const canUpdate = can("inventory", "update");
  const canDelete = can("inventory", "delete");

  const onDelete = async () => {
    if (!material) return;
    if (!window.confirm(`Delete "${material.name}"? Its stock ledger is kept.`)) return;
    setError(null);
    try {
      await deleteMaterial.mutateAsync(material.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the material.");
    }
  };

  return (
    <>
      <Modal
        open={!!materialId && !movementOpen}
        onClose={onClose}
        title={material ? material.name : "Material"}
        description={material?.sku ? `SKU ${material.sku}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {material && canUpdate ? (
              <Button variant="outline" onClick={() => onEdit(material)}>
                <Pencil className="size-4" />
                Edit
              </Button>
            ) : null}
            {material && canDelete ? (
              <Button
                variant="outline"
                className="text-danger hover:text-danger"
                onClick={onDelete}
                disabled={deleteMaterial.isPending}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
            {material && canCreate ? (
              <Button onClick={() => setMovementOpen(true)}>
                <PackagePlus className="size-4" />
                Record movement
              </Button>
            ) : null}
          </>
        }
      >
        {isLoading || !material ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Stock summary */}
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current stock
                </p>
                <p className="text-2xl font-semibold">
                  {material.currentStock}
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    {material.unit}
                  </span>
                </p>
              </div>
              {material.lowStock ? (
                <Badge variant="warning">Low stock</Badge>
              ) : material.reorderLevel != null ? (
                <span className="text-xs text-muted-foreground">
                  Reorder at {material.reorderLevel} {material.unit}
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" value={material.category} />
              <Field label="Unit" value={material.unit} />
              <Field
                label="Reorder level"
                value={
                  material.reorderLevel != null ? `${material.reorderLevel} ${material.unit}` : null
                }
              />
              <Field
                label="Unit cost"
                value={material.unitCost != null ? `₹${material.unitCost}` : null}
              />
              <Field label="Supplier" value={material.supplierRef} />
            </div>
            {material.notes ? <Field label="Notes" value={material.notes} /> : null}

            {/* Recent movements */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent movements
              </p>
              {material.recentMovements.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  No movements yet.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {material.recentMovements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant={TYPE_META[m.type].variant}>
                            {TYPE_META[m.type].label}
                          </Badge>
                          <span className="text-sm font-medium">
                            {movementAmount(m.type, m.quantity, m.balanceAfter, material.unit)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.movementDate}
                          {m.reference ? ` · ${m.reference}` : ""}
                          {m.createdBy ? ` · ${m.createdBy.name}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {m.balanceAfter} {material.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error ? (
              <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            ) : null}
          </div>
        )}
      </Modal>

      <MovementFormModal
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
        material={material ?? null}
      />
    </>
  );
}
