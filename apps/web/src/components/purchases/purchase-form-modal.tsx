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
import {
  formMoney,
  formOptionalMoney,
  formQuantity,
  optionalStringMax,
  requiredString,
} from "@/lib/validation/forms";
import { PAYMENT_MODES, pastOrTodayOrBlankSchema, today } from "@construction-erp/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

const emptyLine = (key: number): LineDraft => ({
  key,
  materialId: "",
  description: "",
  quantity: "",
  unit: "",
  rate: "",
  showMaterial: false,
});

/** Header fields. Maxes mirror `createPurchaseBodySchema`. */
const purchaseFormSchema = z.object({
  sellerName: requiredString(160, "Enter a seller / vendor name."),
  poNumber: optionalStringMax(40),
  orderDate: pastOrTodayOrBlankSchema,
  paymentMode: z.enum(PAYMENT_MODES).nullable(),
  amountPaid: formOptionalMoney(),
  taxAmount: formOptionalMoney(),
  notes: optionalStringMax(2000),
});

type PurchaseFormValues = z.input<typeof purchaseFormSchema>;

interface PurchaseFormOutput {
  sellerName: string;
  poNumber: string | null;
  orderDate: string;
  paymentMode: string | null;
  amountPaid: number | null;
  taxAmount: number | null;
  notes: string | null;
}

/**
 * Line items stay in `useState` (they carry per-row UI state the form doesn't
 * own — the inventory-link toggle and the material auto-fill), so they are
 * validated with a plain parse at submit instead of `useFieldArray`.
 */
const lineSchema = z.object({
  materialId: z.string().uuid().nullable(),
  description: requiredString(200, "Each line needs a description."),
  quantity: formQuantity(),
  unit: optionalStringMax(40),
  // Rate is required per line but may be 0 (free / bundled items).
  rate: formMoney(),
});

const EMPTY: PurchaseFormValues = {
  sellerName: "",
  poNumber: "",
  orderDate: today(),
  paymentMode: "Cash",
  amountPaid: "",
  taxAmount: "",
  notes: "",
};

export function PurchaseFormModal({ open, onClose, onCreated }: PurchaseFormModalProps) {
  const createPurchase = useCreatePurchase();
  const { data: materials } = useMaterials();

  const keyRef = useRef(1);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(0)]);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    keyRef.current = 1;
    reset(EMPTY);
    setLines([emptyLine(0)]);
    setError(null);
  }, [open, reset]);

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
  const tax = Number(watch("taxAmount")) || 0;
  const grandTotal = subtotal + tax;

  const materialOptions = [
    { value: "", label: "No inventory link" },
    ...(materials ?? []).map((m) => ({ value: m.id, label: m.name, hint: m.unit })),
  ];

  const onSubmit = handleSubmit(async (raw) => {
    setError(null);
    const values = raw as unknown as PurchaseFormOutput;

    const items: CreatePurchaseInput["items"] = [];
    for (const l of lines) {
      // A wholly untouched row is a leftover blank, not an error.
      if (!l.description.trim() && !l.materialId && !l.quantity && !l.rate) continue;
      const parsed = lineSchema.safeParse({
        materialId: l.materialId || null,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        rate: l.rate,
      });
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Check this line item.";
        const label = l.description.trim();
        setError(label ? `${label}: ${message}` : message);
        return;
      }
      items.push(parsed.data);
    }
    if (items.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    const paid = values.amountPaid ?? 0;
    const taxValue = values.taxAmount ?? 0;
    const body: CreatePurchaseInput = {
      sellerName: values.sellerName,
      poNumber: values.poNumber,
      orderDate: values.orderDate,
      notes: values.notes,
      taxAmount: taxValue > 0 ? taxValue : undefined,
      amountPaid: paid > 0 ? paid : undefined,
      paymentMode: values.paymentMode,
      items,
    };
    try {
      const po = await createPurchase.mutateAsync(body);
      onCreated(po.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the purchase.");
    }
  });

  const busy = isSubmitting || createPurchase.isPending;

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
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? "Saving…" : "Save purchase"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {/* ── Header ── */}
        <FormSection title="Purchase details">
          <Field
            label="Seller / vendor name"
            htmlFor="po-seller"
            required
            error={errors.sellerName?.message}
          >
            <Input
              id="po-seller"
              placeholder="Name of the person or shop you bought from"
              {...register("sellerName")}
            />
          </Field>
          <FormRow columns={2}>
            <Field label="Purchase date" htmlFor="po-date" error={errors.orderDate?.message}>
              <Input id="po-date" type="date" max={today()} {...register("orderDate")} />
            </Field>
            <Field label="Payment mode" htmlFor="po-paymode" error={errors.paymentMode?.message}>
              <Select id="po-paymode" {...register("paymentMode")}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ref. / Bill no." htmlFor="po-number" error={errors.poNumber?.message}>
              <Input
                id="po-number"
                placeholder="Seller's bill or invoice no. (optional)"
                {...register("poNumber")}
              />
            </Field>
            <Field
              label="Amount paid so far (₹)"
              htmlFor="po-paid"
              error={errors.amountPaid?.message}
            >
              <Input
                id="po-paid"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0 — enter if already paid"
                {...register("amountPaid")}
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Input
                  type="number"
                  inputMode="decimal"
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
                  inputMode="decimal"
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
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                className="ml-auto w-24 text-right sm:w-32"
                {...register("taxAmount")}
              />
            </div>
            {errors.taxAmount?.message ? (
              <p className="text-right text-xs font-medium text-danger" role="alert">
                {errors.taxAmount.message}
              </p>
            ) : null}
            <div className="flex justify-between font-semibold">
              <span className="text-sm">Total</span>
              <span className="tabular-nums">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </FormSection>

        {/* ── Notes ── */}
        <Field label="Notes" htmlFor="po-notes" error={errors.notes?.message}>
          <Input
            id="po-notes"
            placeholder="Any additional details (optional)"
            {...register("notes")}
          />
        </Field>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
