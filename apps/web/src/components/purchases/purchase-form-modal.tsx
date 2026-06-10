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
import { Link2, Plus, ShoppingCart, Trash2 } from "lucide-react";
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
  showMaterial: boolean;
}

const UNIT_SUGGESTIONS = [
  "kg",
  "ton",
  "bag",
  "piece",
  "box",
  "bundle",
  "sq ft",
  "sq m",
  "cu ft",
  "cu m",
  "litre",
  "truck load",
  "load",
  "running ft",
];

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque", "Credit"];

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
  showMaterial: false,
});

export function PurchaseFormModal({ open, onClose, onCreated }: PurchaseFormModalProps) {
  const createPurchase = useCreatePurchase();
  const { data: materials } = useMaterials();

  const keyRef = useRef(1);
  const [sellerName, setSellerName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [taxAmount, setTaxAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(0)]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    keyRef.current = 1;
    setSellerName("");
    setPoNumber("");
    setOrderDate(today());
    setExpectedDate("");
    setPaymentMode("Cash");
    setTaxAmount("");
    setNotes("");
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
  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const tax = Number(taxAmount) || 0;
  const grandTotal = subtotal + tax;

  const materialOptions = [
    { value: "", label: "No inventory link" },
    ...(materials ?? []).map((m) => ({ value: m.id, label: m.name, hint: m.unit })),
  ];

  const submit = async () => {
    setError(null);
    if (!sellerName.trim()) {
      setError("Enter a seller / vendor name.");
      return;
    }
    const items = [];
    for (const l of lines) {
      const desc = l.description.trim();
      const qty = Number(l.quantity);
      const rate = Number(l.rate);
      if (!desc && !l.materialId && !l.quantity && !l.rate) continue;
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
      sellerName: sellerName.trim(),
      poNumber: poNumber.trim() || null,
      orderDate,
      expectedDate: expectedDate || null,
      notes: notes.trim() || null,
      status: "ordered",
      taxAmount: tax > 0 ? tax : undefined,
      paymentMode: paymentMode || null,
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
      description="Record what was purchased, from whom, and at what price."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={createPurchase.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createPurchase.isPending}>
            {createPurchase.isPending ? "Saving…" : "Save purchase"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* ── Header ── */}
        <FormSection title="Purchase details">
          <Field label="Seller / vendor name" htmlFor="po-seller" required>
            <Input
              id="po-seller"
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
              placeholder="Name of the person or shop you bought from"
            />
          </Field>
          <FormRow columns={2}>
            <Field label="Purchase date" htmlFor="po-date">
              <Input
                id="po-date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </Field>
            <Field label="Payment mode" htmlFor="po-paymode">
              <Select
                id="po-paymode"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ref. / Bill no." htmlFor="po-number">
              <Input
                id="po-number"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="Seller's bill or invoice no. (optional)"
              />
            </Field>
            <Field label="Expected delivery" htmlFor="po-expected">
              <Input
                id="po-expected"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </Field>
          </FormRow>
        </FormSection>

        {/* ── Line items ── */}
        <FormSection>
          <div className="flex items-center justify-between">
            <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-foreground/55">
              Items purchased
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
              {/* Description — primary field */}
              <div className="flex items-start gap-2">
                <Input
                  value={l.description}
                  onChange={(e) => updateLine(l.key, { description: e.target.value })}
                  placeholder="What was purchased — e.g. TMT bar 12mm, sand, labour charges…"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-0.5 text-danger hover:text-danger"
                  onClick={() => removeLine(l.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {/* Qty / Unit / Rate */}
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
                  list={`units-${l.key}`}
                  value={l.unit}
                  onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                  placeholder="Unit"
                />
                <datalist id={`units-${l.key}`}>
                  {UNIT_SUGGESTIONS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
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

              {/* Optional inventory link */}
              {l.showMaterial ? (
                <div className="space-y-1">
                  <p className="text-[0.7rem] text-muted-foreground">
                    Inventory link (optional — links this line to a material for stock tracking)
                  </p>
                  <Combobox
                    options={materialOptions}
                    value={l.materialId}
                    onChange={(v) => onPickMaterial(l.key, v)}
                    placeholder="Select a material…"
                    searchPlaceholder="Search materials…"
                    emptyText="No materials yet."
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => updateLine(l.key, { showMaterial: true })}
                  className="flex items-center gap-1 text-[0.73rem] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <Link2 className="size-3" />
                  Link to inventory (optional)
                </button>
              )}
            </div>
          ))}

          {/* Totals */}
          <div className="space-y-1 border-t border-border/70 pt-2.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">GST / Tax (₹)</span>
              <Input
                type="number"
                min="0"
                step="any"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                placeholder="0"
                className="ml-auto w-32 text-right"
              />
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-sm">Total</span>
              <span className="tabular-nums">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </FormSection>

        {/* ── Notes ── */}
        <Field label="Notes" htmlFor="po-notes">
          <Input
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details (optional)"
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
