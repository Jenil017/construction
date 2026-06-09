"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type CreateMaterialInput,
  type Material,
  type UpdateMaterialInput,
  useCreateMaterial,
  useUpdateMaterial,
} from "@/lib/hooks/use-inventory";
import { useEffect, useState } from "react";

interface MaterialFormModalProps {
  open: boolean;
  onClose: () => void;
  material?: Material | null;
}

const textareaClass =
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Parse a non-negative number field; "" → null, invalid → NaN (caught on submit). */
function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return Number(trimmed);
}

export function MaterialFormModal({ open, onClose, material }: MaterialFormModalProps) {
  const isEdit = !!material;
  const createMaterial = useCreateMaterial();
  const updateMaterial = useUpdateMaterial();

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(material?.name ?? "");
    setUnit(material?.unit ?? "");
    setSku(material?.sku ?? "");
    setCategory(material?.category ?? "");
    setReorderLevel(material?.reorderLevel != null ? String(material.reorderLevel) : "");
    setUnitCost(material?.unitCost != null ? String(material.unitCost) : "");
    setSupplierRef(material?.supplierRef ?? "");
    setOpeningStock("");
    setNotes(material?.notes ?? "");
  }, [open, material]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Material name is required.");
      return;
    }
    if (!unit.trim()) {
      setError("Unit is required (e.g. bags, cum, kg, nos).");
      return;
    }

    const reorder = parseOptionalNumber(reorderLevel);
    const cost = parseOptionalNumber(unitCost);
    const opening = parseOptionalNumber(openingStock);
    for (const [value, label] of [
      [reorder, "Reorder level"],
      [cost, "Unit cost"],
      [opening, "Opening stock"],
    ] as const) {
      if (value != null && (Number.isNaN(value) || value < 0)) {
        setError(`${label} must be a non-negative number.`);
        return;
      }
    }

    try {
      if (isEdit && material) {
        const body: UpdateMaterialInput = {
          name: name.trim(),
          unit: unit.trim(),
          sku: sku.trim() || null,
          category: category.trim() || null,
          reorderLevel: reorder,
          unitCost: cost,
          supplierRef: supplierRef.trim() || null,
          notes: notes.trim() || null,
        };
        await updateMaterial.mutateAsync({ id: material.id, body });
      } else {
        const body: CreateMaterialInput = {
          name: name.trim(),
          unit: unit.trim(),
          sku: sku.trim() || null,
          category: category.trim() || null,
          reorderLevel: reorder,
          unitCost: cost,
          supplierRef: supplierRef.trim() || null,
          notes: notes.trim() || null,
          ...(opening != null && opening > 0 ? { openingStock: opening } : {}),
        };
        await createMaterial.mutateAsync(body);
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the material.");
    }
  };

  const busy = createMaterial.isPending || updateMaterial.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit material" : "New material"}
      description={isEdit ? material?.name : "Add a material to this site's inventory."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mat-name">Name</Label>
            <Input
              id="mat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OPC 53 Cement"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mat-unit">Unit</Label>
            <Input
              id="mat-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="bags, cum, kg, nos"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mat-sku">SKU / code</Label>
            <Input
              id="mat-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mat-category">Category</Label>
            <Input
              id="mat-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Cement, Steel, Aggregates"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mat-reorder">Reorder level</Label>
            <Input
              id="mat-reorder"
              type="number"
              min="0"
              step="any"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              placeholder="Low-stock alert below this"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mat-cost">Unit cost (₹)</Label>
            <Input
              id="mat-cost"
              type="number"
              min="0"
              step="any"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {!isEdit ? (
            <div className="space-y-1.5">
              <Label htmlFor="mat-opening">Opening stock</Label>
              <Input
                id="mat-opening"
                type="number"
                min="0"
                step="any"
                value={openingStock}
                onChange={(e) => setOpeningStock(e.target.value)}
                placeholder="Defaults to 0"
              />
            </div>
          ) : null}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mat-supplier">Supplier reference</Label>
            <Input
              id="mat-supplier"
              value={supplierRef}
              onChange={(e) => setSupplierRef(e.target.value)}
              placeholder="Supplier name / contact (optional)"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mat-notes">Notes</Label>
          <textarea
            id="mat-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional"
            className={textareaClass}
          />
        </div>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
