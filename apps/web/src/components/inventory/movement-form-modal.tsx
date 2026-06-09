"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type CreateMovementInput,
  type Material,
  type MovementType,
  useCreateStockMovement,
} from "@/lib/hooks/use-inventory";
import { useEffect, useState } from "react";

interface MovementFormModalProps {
  open: boolean;
  onClose: () => void;
  material: Material | null;
}

const TYPES: { value: MovementType; label: string; hint: string }[] = [
  { value: "inward", label: "Inward", hint: "Stock received (adds to stock)" },
  { value: "outward", label: "Outward", hint: "Stock issued / consumed (reduces stock)" },
  { value: "wastage", label: "Wastage", hint: "Damaged / lost stock (reduces stock)" },
  { value: "adjustment", label: "Adjustment", hint: "Set the counted stock (stock-take)" },
];

const textareaClass =
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground/70 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/30";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MovementFormModal({ open, onClose, material }: MovementFormModalProps) {
  const createMovement = useCreateStockMovement();

  const [type, setType] = useState<MovementType>("inward");
  const [amount, setAmount] = useState("");
  const [movementDate, setMovementDate] = useState(today());
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType("inward");
    setAmount("");
    setMovementDate(today());
    setUnitCost("");
    setReference("");
    setNote("");
    setError(null);
  }, [open]);

  if (!material) return null;
  const isAdjustment = type === "adjustment";

  // Live preview of the resulting stock.
  const parsed = amount.trim() === "" ? null : Number(amount);
  let resulting: number | null = null;
  if (parsed != null && !Number.isNaN(parsed) && parsed >= 0) {
    if (isAdjustment) resulting = parsed;
    else if (type === "inward") resulting = material.currentStock + parsed;
    else resulting = material.currentStock - parsed;
  }

  const submit = async () => {
    setError(null);
    const value = Number(amount);
    if (amount.trim() === "" || Number.isNaN(value) || value < 0) {
      setError(
        isAdjustment ? "Enter the counted stock (0 or more)." : "Enter a quantity greater than 0.",
      );
      return;
    }
    if (!isAdjustment && value <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }

    const cost = unitCost.trim() === "" ? null : Number(unitCost);
    if (cost != null && (Number.isNaN(cost) || cost < 0)) {
      setError("Unit cost must be a non-negative number.");
      return;
    }

    const body: CreateMovementInput = {
      materialId: material.id,
      type,
      movementDate,
      reference: reference.trim() || null,
      note: note.trim() || null,
      ...(isAdjustment ? { newStock: value } : { quantity: value }),
      ...(type === "inward" && cost != null ? { unitCost: cost } : {}),
    };

    try {
      await createMovement.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the movement.");
    }
  };

  const busy = createMovement.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record movement"
      description={`${material.name} · ${material.currentStock} ${material.unit} in stock`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Record"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  type === t.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {TYPES.find((t) => t.value === type)?.hint}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mv-amount">
              {isAdjustment ? `Counted stock (${material.unit})` : `Quantity (${material.unit})`}
            </Label>
            <Input
              id="mv-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={isAdjustment ? "New stock count" : "How much"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-date">Date</Label>
            <Input
              id="mv-date"
              type="date"
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
            />
          </div>
          {type === "inward" ? (
            <div className="space-y-1.5">
              <Label htmlFor="mv-cost">Unit cost (₹)</Label>
              <Input
                id="mv-cost"
                type="number"
                min="0"
                step="any"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="Optional"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="mv-ref">Reference</Label>
            <Input
              id="mv-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Supplier / bill no / DPR (optional)"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mv-note">Note</Label>
          <textarea
            id="mv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional"
            className={textareaClass}
          />
        </div>

        {resulting != null ? (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              resulting < 0 ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground"
            }`}
          >
            {resulting < 0
              ? `Not enough stock — only ${material.currentStock} ${material.unit} available.`
              : `Stock after this: ${resulting} ${material.unit}`}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
