"use client";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormRow, FormSection } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { useMaterials } from "@/lib/hooks/use-inventory";
import { type CreatePurchaseInput, useCreatePurchase } from "@/lib/hooks/use-purchases";
import { useSuppliers } from "@/lib/hooks/use-suppliers";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PurchaseFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

interface LineDraft {
  key: number;
  materialId: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyLine = (key: number): LineDraft => ({
  key,
  materialId: "",
  description: "",
  quantity: "",
  unit: "",
  rate: "",
});

export function PurchaseFormModal({ open, onClose, onCreated }: PurchaseFormModalProps) {
  const createPurchase = useCreatePurchase();
  const { data: suppliers } = useSuppliers();
  const { data: materials } = useMaterials();

  const keyRef = useRef(1);
  const [supplierId, setSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"draft" | "ordered">("ordered");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(0)]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    keyRef.current = 1;
    setSupplierId("");
    setPoNumber("");
    setOrderDate(today());
    setExpectedDate("");
    setNotes("");
    setStatus("ordered");
    setLines([emptyLine(0)]);
    setError(null);
  }, [open]);

  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onPickMaterial = (key: number, materialId: string) => {
    const mat = (materials ?? []).find((m) => m.id === materialId);
    updateLine(key, {
      materialId,
      ...(mat
        ? {
            description: mat.name,
            unit: mat.unit,
            rate: mat.unitCost != null ? String(mat.unitCost) : "",
          }
        : {}),
    });
  };

  const addLine = () => {
    const key = keyRef.current++;
    setLines((ls) => [...ls, emptyLine(key)]);
  };
  const removeLine = (key: number) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const lineAmount = (l: LineDraft) => (Number(l.quantity) || 0) * (Number(l.rate) || 0);
  const total = lines.reduce((s, l) => s + lineAmount(l), 0);

  const materialOptions = [
    { value: "", label: "Free item (no material)" },
    ...(materials ?? []).map((m) => ({ value: m.id, label: m.name, hint: m.unit })),
  ];

  const submit = async () => {
    setError(null);
    if (!supplierId) {
      setError("Select a supplier.");
      return;
    }
    const items = [];
    for (const l of lines) {
      const desc = l.description.trim();
      const qty = Number(l.quantity);
      const rate = Number(l.rate);
      if (!desc && !l.materialId && !l.quantity && !l.rate) continue; // skip blank line
      if (!desc) {
        setError("Each line needs a description.");
        return;
      }
      if (Number.isNaN(qty) || qty <= 0) {
        setError(`Enter a quantity for "${desc}".`);
        return;
      }
      if (Number.isNaN(rate) || rate < 0) {
        setError(`Enter a valid rate for "${desc}".`);
        return;
      }
      items.push({
        materialId: l.materialId || null,
        description: desc,
        quantity: qty,
        unit: l.unit.trim() || null,
        rate,
      });
    }
    if (items.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    const body: CreatePurchaseInput = {
      supplierId,
      poNumber: poNumber.trim() || null,
      orderDate,
      expectedDate: expectedDate || null,
      notes: notes.trim() || null,
      status,
      items,
    };
    try {
      const po = await createPurchase.mutateAsync(body);
      onCreated(po.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the purchase.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ShoppingCart}
      size="lg"
      title="New purchase"
      description="Create a purchase order with line items."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={createPurchase.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createPurchase.isPending}>
            {createPurchase.isPending ? "Saving…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <FormSection title="Order details">
          <Field label="Supplier" htmlFor="po-supplier" required>
            <Combobox
              id="po-supplier"
              options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="Select a supplier…"
              searchPlaceholder="Search suppliers…"
              emptyText="No suppliers yet."
            />
          </Field>
          <FormRow columns={2}>
            <Field label="PO number" htmlFor="po-number">
              <Input
                id="po-number"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Status" htmlFor="po-status">
              <Select
                id="po-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as "draft" | "ordered")}
              >
                <option value="ordered">Ordered</option>
                <option value="draft">Draft</option>
              </Select>
            </Field>
            <Field label="Order date" htmlFor="po-date">
              <Input
                id="po-date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </Field>
            <Field label="Expected date" htmlFor="po-expected">
              <Input
                id="po-expected"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection>
          <div className="flex items-center justify-between">
            <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-foreground/55">
              Line items
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="size-4" />
              Add line
            </Button>
          </div>
          {lines.map((l) => (
            <div
              key={l.key}
              className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3"
            >
              <div className="flex items-center gap-2">
                <Combobox
                  className="flex-1"
                  options={materialOptions}
                  value={l.materialId}
                  onChange={(v) => onPickMaterial(l.key, v)}
                  placeholder="Free item (no material)"
                  searchPlaceholder="Search materials…"
                  emptyText="No materials yet."
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:text-danger"
                  onClick={() => removeLine(l.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Input
                value={l.description}
                onChange={(e) => updateLine(l.key, { description: e.target.value })}
                placeholder="Description"
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={l.quantity}
                  onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  placeholder="Qty"
                />
                <Input
                  value={l.unit}
                  onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                  placeholder="Unit"
                />
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={l.rate}
                  onChange={(e) => updateLine(l.key, { rate: e.target.value })}
                  placeholder="Rate ₹"
                />
              </div>
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                Amount: ₹{lineAmount(l).toFixed(2)}
              </p>
            </div>
          ))}
          <div className="flex justify-end border-t border-border/70 pt-2.5 text-sm font-semibold">
            <span className="nums">Total: ₹{total.toFixed(2)}</span>
          </div>
        </FormSection>

        <Field label="Notes" htmlFor="po-notes">
          <Input
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </Field>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
