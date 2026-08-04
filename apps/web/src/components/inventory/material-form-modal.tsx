"use client";

import { Button } from "@/components/ui/button";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type CreateMaterialInput,
  type Material,
  type UpdateMaterialInput,
  useCreateMaterial,
  useUpdateMaterial,
} from "@/lib/hooks/use-inventory";
import {
  formOptionalMoney,
  formOptionalQuantity,
  optionalStringMax,
  requiredString,
} from "@/lib/validation/forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface MaterialFormModalProps {
  open: boolean;
  onClose: () => void;
  material?: Material | null;
}

const textareaClass =
  "flex min-h-[72px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50";

/** Mirrors the API's material schema (`createMaterialBodySchema`); maxes track the DB columns. */
const materialFormSchema = z.object({
  name: requiredString(160, "Enter the material's name."),
  unit: requiredString(40, "Unit is required (e.g. bags, cum, kg, nos)."),
  sku: optionalStringMax(60),
  category: optionalStringMax(80),
  reorderLevel: formOptionalQuantity({ allowZero: true }),
  unitCost: formOptionalMoney(),
  supplierRef: optionalStringMax(160),
  openingStock: formOptionalQuantity({ allowZero: true }),
  notes: optionalStringMax(2000),
});

/** The raw form values are all strings; the schema output is what the API takes. */
type MaterialFormValues = z.input<typeof materialFormSchema>;

const EMPTY: MaterialFormValues = {
  name: "",
  unit: "",
  sku: "",
  category: "",
  reorderLevel: "",
  unitCost: "",
  supplierRef: "",
  openingStock: "",
  notes: "",
};

export function MaterialFormModal({ open, onClose, material }: MaterialFormModalProps) {
  const isEdit = !!material;
  const createMaterial = useCreateMaterial();
  const updateMaterial = useUpdateMaterial();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MaterialFormValues>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(
      material
        ? {
            name: material.name,
            unit: material.unit,
            sku: material.sku ?? "",
            category: material.category ?? "",
            reorderLevel: material.reorderLevel != null ? String(material.reorderLevel) : "",
            unitCost: material.unitCost != null ? String(material.unitCost) : "",
            supplierRef: material.supplierRef ?? "",
            openingStock: "",
            notes: material.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, material, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    // `values` is the schema *output*: trimmed, "" already mapped to null.
    const { openingStock, ...master } = values as unknown as UpdateMaterialInput & {
      openingStock: number | null;
    };
    try {
      if (isEdit && material) {
        await updateMaterial.mutateAsync({ id: material.id, body: master });
      } else {
        await createMaterial.mutateAsync({
          ...(master as CreateMaterialInput),
          ...(openingStock != null && openingStock > 0 ? { openingStock } : {}),
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the material.");
    }
  });

  const busy = isSubmitting || createMaterial.isPending || updateMaterial.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Package}
      title={isEdit ? "Edit material" : "New material"}
      description={isEdit ? material?.name : "Add a material to this site's inventory."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormRow columns={2}>
          <Field
            label="Name"
            htmlFor="mat-name"
            required
            error={errors.name?.message}
            className="sm:col-span-2"
          >
            <Input id="mat-name" placeholder="e.g. OPC 53 Cement" {...register("name")} />
          </Field>
          <Field label="Unit" htmlFor="mat-unit" required error={errors.unit?.message}>
            <Input id="mat-unit" placeholder="bags, cum, kg, nos" {...register("unit")} />
          </Field>
          <Field label="SKU / code" htmlFor="mat-sku" error={errors.sku?.message}>
            <Input id="mat-sku" placeholder="Optional" {...register("sku")} />
          </Field>
          <Field label="Category" htmlFor="mat-category" error={errors.category?.message}>
            <Input
              id="mat-category"
              placeholder="e.g. Cement, Steel, Aggregates"
              {...register("category")}
            />
          </Field>
          <Field label="Reorder level" htmlFor="mat-reorder" error={errors.reorderLevel?.message}>
            <Input
              id="mat-reorder"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="Low-stock alert below this"
              {...register("reorderLevel")}
            />
          </Field>
          <Field label="Unit cost (₹)" htmlFor="mat-cost" error={errors.unitCost?.message}>
            <Input
              id="mat-cost"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="Optional"
              {...register("unitCost")}
            />
          </Field>
          {!isEdit ? (
            <Field label="Opening stock" htmlFor="mat-opening" error={errors.openingStock?.message}>
              <Input
                id="mat-opening"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="Defaults to 0"
                {...register("openingStock")}
              />
            </Field>
          ) : null}
          <Field
            label="Supplier reference"
            htmlFor="mat-supplier"
            error={errors.supplierRef?.message}
            className="sm:col-span-2"
          >
            <Input
              id="mat-supplier"
              placeholder="Supplier name / contact (optional)"
              {...register("supplierRef")}
            />
          </Field>
        </FormRow>

        <Field label="Notes" htmlFor="mat-notes" error={errors.notes?.message}>
          <textarea
            id="mat-notes"
            rows={2}
            placeholder="Optional"
            className={textareaClass}
            {...register("notes")}
          />
        </Field>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </form>
    </Modal>
  );
}
