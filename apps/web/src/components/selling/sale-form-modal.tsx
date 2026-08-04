"use client";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  type CreateSaleInput,
  type SiteSale,
  type UpdateSaleInput,
  useAvailableMaterials,
  useCreateSale,
  useUpdateSale,
} from "@/lib/hooks/use-selling";
import {
  formMoney,
  formOptionalMoney,
  formOptionalPhone,
  formQuantity,
  optionalStringMax,
} from "@/lib/validation/forms";
import { PAYMENT_MODES, pastOrTodayOrBlankSchema, today } from "@construction-erp/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

interface SaleFormModalProps {
  open: boolean;
  onClose: () => void;
  sale?: SiteSale | null;
}

function fmtQty(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/**
 * Mirrors `createSaleBodySchema` / `updateSaleBodySchema`. The stock ceiling is
 * a per-render `superRefine` because it comes from the selected material, not
 * from a constant — the server re-checks it against live stock regardless.
 */
function buildSchema(isEdit: boolean, available: number | null, unit: string | undefined) {
  return z.object({
    saleDate: pastOrTodayOrBlankSchema,
    materialId: isEdit ? z.string() : z.string().uuid("Select an item to sell."),
    quantity: isEdit
      ? z.string()
      : formQuantity().superRefine((n, ctx) => {
          if (available != null && n > available) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Only ${fmtQty(available)} ${unit ?? ""} in stock.`,
            });
          }
        }),
    ratePerUnit: formMoney(),
    amountReceived: formOptionalMoney(),
    buyerName: optionalStringMax(160),
    buyerContact: formOptionalPhone,
    paymentMode: z.enum(PAYMENT_MODES).nullable(),
    notes: optionalStringMax(2000),
  });
}

type SaleFormValues = z.input<ReturnType<typeof buildSchema>>;

/** The schema output, once strings have been coerced and blanks nulled. */
interface SaleFormOutput {
  saleDate: string;
  materialId: string;
  quantity: number;
  ratePerUnit: number;
  amountReceived: number | null;
  buyerName: string | null;
  buyerContact: string | null;
  paymentMode: string | null;
  notes: string | null;
}

const EMPTY: SaleFormValues = {
  saleDate: today(),
  materialId: "",
  quantity: "",
  ratePerUnit: "",
  amountReceived: "",
  buyerName: "",
  buyerContact: "",
  paymentMode: "Cash",
  notes: "",
};

export function SaleFormModal({ open, onClose, sale }: SaleFormModalProps) {
  const isEdit = !!sale;
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const [error, setError] = useState<string | null>(null);

  // Only the create flow needs the in-stock item list (item is locked on edit).
  const { data: materials, isLoading: materialsLoading } = useAvailableMaterials(open && !isEdit);

  // The selected material has to be resolved *before* `useForm`, because the
  // quantity ceiling in the schema is its current stock. Tracked here and kept
  // in step by the Combobox's onChange rather than read back via `watch`.
  const [materialId, setMaterialId] = useState("");
  const selectedMaterial = useMemo(
    () => materials?.find((m) => m.id === materialId) ?? null,
    [materials, materialId],
  );

  // Unit + available stock come from the chosen material (or the sale on edit).
  const unit = isEdit ? sale?.unit : selectedMaterial?.unit;
  const available = selectedMaterial?.currentStock ?? null;

  const schema = useMemo(() => buildSchema(isEdit, available, unit), [isEdit, available, unit]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SaleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const quantity = watch("quantity");
  const ratePerUnit = watch("ratePerUnit");

  const options: ComboboxOption[] = useMemo(
    () =>
      (materials ?? []).map((m) => ({
        value: m.id,
        label: m.sku ? `${m.name} · ${m.sku}` : m.name,
        hint: `${fmtQty(m.currentStock)} ${m.unit}`,
      })),
    [materials],
  );

  const qtyNum = Number(quantity);
  const overStock = !isEdit && available != null && qtyNum > available;

  const computedTotal =
    qtyNum > 0 && Number(ratePerUnit) >= 0 ? (qtyNum * Number(ratePerUnit)).toFixed(2) : null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMaterialId(sale?.materialId ?? "");
    reset(
      sale
        ? {
            saleDate: sale.saleDate,
            materialId: sale.materialId,
            quantity: String(sale.quantity),
            ratePerUnit: String(sale.ratePerUnit),
            amountReceived: "",
            buyerName: sale.buyerName ?? "",
            buyerContact: sale.buyerContact ?? "",
            paymentMode: (sale.paymentMode as SaleFormValues["paymentMode"]) ?? "Cash",
            notes: sale.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, sale, reset]);

  const onSubmit = handleSubmit(async (raw) => {
    setError(null);
    const values = raw as unknown as SaleFormOutput;
    try {
      if (isEdit && sale) {
        const body: UpdateSaleInput = {
          saleDate: values.saleDate,
          ratePerUnit: values.ratePerUnit,
          buyerName: values.buyerName,
          buyerContact: values.buyerContact,
          paymentMode: values.paymentMode,
          notes: values.notes,
        };
        await updateSale.mutateAsync({ id: sale.id, body });
      } else {
        const received = values.amountReceived ?? 0;
        const body: CreateSaleInput = {
          saleDate: values.saleDate,
          materialId: values.materialId,
          quantity: values.quantity,
          ratePerUnit: values.ratePerUnit,
          buyerName: values.buyerName,
          buyerContact: values.buyerContact,
          paymentMode: values.paymentMode,
          ...(received > 0 ? { amountReceived: received } : {}),
          notes: values.notes,
        };
        await createSale.mutateAsync(body);
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the sale record.");
    }
  });

  const busy = isSubmitting || createSale.isPending || updateSale.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ShoppingBag}
      title={isEdit ? "Edit sale record" : "New sale record"}
      description={
        isEdit
          ? "Update sale details. The item and quantity are fixed."
          : "Sell an item from your inventory — stock is deducted automatically."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy || overStock}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormRow columns={2}>
          <Field label="Sale date" htmlFor="sale-date" error={errors.saleDate?.message}>
            <Input id="sale-date" type="date" max={today()} {...register("saleDate")} />
          </Field>
          <Field label="Item" htmlFor="sale-item" required error={errors.materialId?.message}>
            {isEdit ? (
              <Input id="sale-item" value={sale?.itemDescription ?? ""} disabled />
            ) : (
              <Controller
                control={control}
                name="materialId"
                render={({ field }) => (
                  <Combobox
                    id="sale-item"
                    options={options}
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      setMaterialId(v);
                    }}
                    disabled={materialsLoading}
                    placeholder={materialsLoading ? "Loading items…" : "Select an item…"}
                    searchPlaceholder="Type to search inventory…"
                    emptyText={
                      materialsLoading
                        ? "Loading…"
                        : "No items in stock. Add stock in Inventory first."
                    }
                  />
                )}
              />
            )}
          </Field>
        </FormRow>

        {!isEdit && available != null ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {fmtQty(available)} {unit}
            </span>{" "}
            available in stock.
          </p>
        ) : null}

        <FormRow columns={3}>
          <Field label="Quantity" htmlFor="sale-qty" required error={errors.quantity?.message}>
            <Input
              id="sale-qty"
              type="number"
              inputMode="decimal"
              min="0"
              max={!isEdit && available != null ? available : undefined}
              step="any"
              disabled={isEdit}
              placeholder="e.g. 50"
              aria-invalid={overStock}
              {...register("quantity")}
            />
          </Field>
          <Field label="Unit" htmlFor="sale-unit">
            <Input
              id="sale-unit"
              value={unit ?? ""}
              disabled
              placeholder={isEdit ? "" : "Pick an item"}
            />
          </Field>
          <Field
            label="Rate / unit (₹)"
            htmlFor="sale-rate"
            required
            error={errors.ratePerUnit?.message}
          >
            <Input
              id="sale-rate"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="e.g. 35"
              {...register("ratePerUnit")}
            />
            {!isEdit && selectedMaterial?.unitCost != null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Last cost ₹{selectedMaterial.unitCost}/{selectedMaterial.unit}
              </p>
            ) : null}
          </Field>
        </FormRow>

        {overStock ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            Quantity exceeds available stock ({fmtQty(available ?? 0)} {unit}).
          </div>
        ) : null}

        {computedTotal !== null ? (
          <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total amount: </span>
            <span className="font-semibold tabular-nums">₹{computedTotal}</span>
          </div>
        ) : null}

        <FormRow columns={2}>
          <Field label="Buyer name" htmlFor="sale-buyer" error={errors.buyerName?.message}>
            <Input
              id="sale-buyer"
              placeholder="Name of the buyer (optional)"
              {...register("buyerName")}
            />
          </Field>
          <Field label="Buyer contact" htmlFor="sale-contact" error={errors.buyerContact?.message}>
            <Input
              id="sale-contact"
              type="tel"
              inputMode="numeric"
              placeholder="Phone number (optional)"
              {...register("buyerContact")}
            />
          </Field>
        </FormRow>

        <FormRow columns={2}>
          <Field label="Payment mode" htmlFor="sale-mode" error={errors.paymentMode?.message}>
            <Select id="sale-mode" {...register("paymentMode")}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          {!isEdit ? (
            <Field
              label="Amount received so far (₹)"
              htmlFor="sale-received"
              error={errors.amountReceived?.message}
            >
              <Input
                id="sale-received"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0 — enter if already received"
                {...register("amountReceived")}
              />
            </Field>
          ) : null}
        </FormRow>

        <Field label="Notes" htmlFor="sale-notes" error={errors.notes?.message}>
          <Input
            id="sale-notes"
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
