"use client";

import { Button } from "@/components/ui/button";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type CreateSupplierInput,
  type Supplier,
  type UpdateSupplierInput,
  useCreateSupplier,
  useUpdateSupplier,
} from "@/lib/hooks/use-suppliers";
import {
  formOptionalEmail,
  formOptionalGstin,
  formOptionalPhone,
  optionalStringMax,
  requiredString,
} from "@/lib/validation/forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface SupplierFormModalProps {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
}

const textareaClass =
  "flex min-h-[72px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Field rules mirror the API's supplier schema (both sides build on the same
 * primitives in `@construction-erp/shared`), so the browser rejects exactly what
 * the server would — the user gets an inline message instead of a round-trip.
 * Maxes track the DB column widths.
 */
const supplierFormSchema = z.object({
  name: requiredString(160, "Enter the supplier's name."),
  contactPerson: optionalStringMax(120),
  phone: formOptionalPhone,
  email: formOptionalEmail,
  gstin: formOptionalGstin,
  address: optionalStringMax(500),
  notes: optionalStringMax(500),
});

/** The raw form values are all strings; the schema output is what the API takes. */
type SupplierFormValues = z.input<typeof supplierFormSchema>;

const EMPTY: SupplierFormValues = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  gstin: "",
  address: "",
  notes: "",
};

export function SupplierFormModal({ open, onClose, supplier }: SupplierFormModalProps) {
  const isEdit = !!supplier;
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(
      supplier
        ? {
            name: supplier.name,
            contactPerson: supplier.contactPerson ?? "",
            phone: supplier.phone ?? "",
            email: supplier.email ?? "",
            gstin: supplier.gstin ?? "",
            address: supplier.address ?? "",
            notes: supplier.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, supplier, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    // `values` is the schema *output*: trimmed, "" already mapped to null.
    const body = values as unknown as CreateSupplierInput & UpdateSupplierInput;
    try {
      if (isEdit && supplier) await updateSupplier.mutateAsync({ id: supplier.id, body });
      else await createSupplier.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the supplier.");
    }
  });

  const busy = isSubmitting || createSupplier.isPending || updateSupplier.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Truck}
      title={isEdit ? "Edit supplier" : "New supplier"}
      description={isEdit ? supplier?.name : "Add a supplier to this site."}
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
            htmlFor="sup-name"
            required
            error={errors.name?.message}
            className="sm:col-span-2"
          >
            <Input id="sup-name" placeholder="e.g. Shree Cement Traders" {...register("name")} />
          </Field>
          <Field label="Contact person" htmlFor="sup-contact" error={errors.contactPerson?.message}>
            <Input id="sup-contact" placeholder="Optional" {...register("contactPerson")} />
          </Field>
          <Field label="Phone" htmlFor="sup-phone" error={errors.phone?.message}>
            <Input
              id="sup-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="10-digit mobile"
              {...register("phone")}
            />
          </Field>
          <Field label="Email" htmlFor="sup-email" error={errors.email?.message}>
            <Input
              id="sup-email"
              type="email"
              autoComplete="email"
              placeholder="Optional"
              {...register("email")}
            />
          </Field>
          <Field
            label="GSTIN"
            htmlFor="sup-gstin"
            error={errors.gstin?.message}
            hint="15 characters, e.g. 24AAAAA0000A1Z5"
          >
            <Input
              id="sup-gstin"
              maxLength={15}
              autoCapitalize="characters"
              placeholder="Optional"
              {...register("gstin")}
            />
          </Field>
        </FormRow>
        <Field label="Address" htmlFor="sup-address" error={errors.address?.message}>
          <textarea
            id="sup-address"
            rows={2}
            placeholder="Optional"
            className={textareaClass}
            {...register("address")}
          />
        </Field>
        <Field label="Notes" htmlFor="sup-notes" error={errors.notes?.message}>
          <Input id="sup-notes" placeholder="Optional" {...register("notes")} />
        </Field>
        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </form>
    </Modal>
  );
}
