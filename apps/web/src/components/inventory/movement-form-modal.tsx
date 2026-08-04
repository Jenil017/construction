"use client";

import { Button } from "@/components/ui/button";
import { Field, FormRow } from "@/components/ui/form";
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
import { formOptionalMoney, formQuantity, optionalStringMax } from "@/lib/validation/forms";
import { pastOrTodayOrBlankSchema, today } from "@construction-erp/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
  "flex min-h-[72px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Mirrors the API's `createMovementBodySchema`. `amount` is one field in the form
 * but two on the wire: an adjustment sends it as `newStock` (0 allowed — a stock-take
 * can count zero), everything else as a positive `quantity`. Zero is rejected for the
 * latter by the refine below rather than by two separate schemas.
 */
const movementFormSchema = z
  .object({
    type: z.enum(["inward", "outward", "wastage", "adjustment"]),
    amount: formQuantity({ allowZero: true }),
    movementDate: pastOrTodayOrBlankSchema,
    unitCost: formOptionalMoney(),
    reference: optionalStringMax(160),
    note: optionalStringMax(2000),
  })
  .refine((v) => v.type === "adjustment" || v.amount > 0, {
    message: "Enter a quantity greater than 0.",
    path: ["amount"],
  });

/** The raw form values are all strings; the schema output is what the API takes. */
type MovementFormValues = z.input<typeof movementFormSchema>;

const EMPTY: MovementFormValues = {
  type: "inward",
  amount: "",
  movementDate: today(),
  unitCost: "",
  reference: "",
  note: "",
};

export function MovementFormModal({ open, onClose, material }: MovementFormModalProps) {
  const createMovement = useCreateStockMovement();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MovementFormValues>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(EMPTY);
  }, [open, reset]);

  const type = watch("type");
  const amount = watch("amount");

  const onSubmit = handleSubmit(async (values) => {
    if (!material) return;
    setError(null);
    // `values` is the schema *output*: trimmed, coerced, "" already mapped to null.
    const v = values as unknown as {
      type: MovementType;
      amount: number;
      movementDate: string;
      unitCost: number | null;
      reference: string | null;
      note: string | null;
    };
    const body: CreateMovementInput = {
      materialId: material.id,
      type: v.type,
      movementDate: v.movementDate,
      reference: v.reference,
      note: v.note,
      ...(v.type === "adjustment" ? { newStock: v.amount } : { quantity: v.amount }),
      ...(v.type === "inward" && v.unitCost != null ? { unitCost: v.unitCost } : {}),
    };

    try {
      await createMovement.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the movement.");
    }
  });

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

  const busy = isSubmitting || createMovement.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ArrowRightLeft}
      title="Record movement"
      description={`${material.name} · ${material.currentStock} ${material.unit} in stock`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? "Saving…" : "Record"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setValue("type", t.value)}
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

        <FormRow columns={2}>
          <Field
            label={
              isAdjustment ? `Counted stock (${material.unit})` : `Quantity (${material.unit})`
            }
            htmlFor="mv-amount"
            required
            error={errors.amount?.message}
          >
            <Input
              id="mv-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder={isAdjustment ? "New stock count" : "How much"}
              {...register("amount")}
            />
          </Field>
          <Field label="Date" htmlFor="mv-date" error={errors.movementDate?.message}>
            <Input id="mv-date" type="date" max={today()} {...register("movementDate")} />
          </Field>
          {type === "inward" ? (
            <Field label="Unit cost (₹)" htmlFor="mv-cost" error={errors.unitCost?.message}>
              <Input
                id="mv-cost"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="Optional"
                {...register("unitCost")}
              />
            </Field>
          ) : null}
          <Field label="Reference" htmlFor="mv-ref" error={errors.reference?.message}>
            <Input
              id="mv-ref"
              placeholder="Supplier / bill no / DPR (optional)"
              {...register("reference")}
            />
          </Field>
        </FormRow>

        <Field label="Note" htmlFor="mv-note" error={errors.note?.message}>
          <textarea
            id="mv-note"
            rows={2}
            placeholder="Optional"
            className={textareaClass}
            {...register("note")}
          />
        </Field>

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
      </form>
    </Modal>
  );
}
