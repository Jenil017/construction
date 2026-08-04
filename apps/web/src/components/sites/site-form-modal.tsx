"use client";

import { Button } from "@/components/ui/button";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  type SiteRow,
  type SiteStatus,
  type UpdateSiteInput,
  useCreateSite,
  useUpdateSite,
} from "@/lib/hooks/use-sites";
import { optionalStringMax, requiredString } from "@/lib/validation/forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface SiteFormModalProps {
  open: boolean;
  onClose: () => void;
  site?: SiteRow | null;
}

const STATUS_OPTIONS: { value: SiteStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "completed", label: "Completed" },
];

/** Mirrors the API's site schema (`createSiteBodySchema`); maxes track the DB columns. */
const siteFormSchema = z.object({
  name: requiredString(160, "Enter the site's name."),
  code: optionalStringMax(40),
  city: optionalStringMax(120),
  state: optionalStringMax(120),
  status: z.enum(["active", "inactive", "completed"]),
  address: optionalStringMax(2000),
});

/** The raw form values are all strings; the schema output is what the API takes. */
type SiteFormValues = z.input<typeof siteFormSchema>;

const EMPTY: SiteFormValues = {
  name: "",
  code: "",
  city: "",
  state: "",
  status: "active",
  address: "",
};

export function SiteFormModal({ open, onClose, site }: SiteFormModalProps) {
  const isEdit = !!site;
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(siteFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(
      site
        ? {
            name: site.name,
            code: site.code ?? "",
            city: site.city ?? "",
            state: site.state ?? "",
            status: site.status,
            address: site.address ?? "",
          }
        : EMPTY,
    );
  }, [open, site, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    // `values` is the schema *output*: trimmed, "" already mapped to null.
    const body = values as unknown as UpdateSiteInput;
    try {
      if (isEdit && site) {
        await updateSite.mutateAsync({ id: site.id, body });
      } else {
        // Create takes optional strings, not nullable ones — drop the blanks.
        await createSite.mutateAsync({
          name: body.name as string,
          code: body.code ?? undefined,
          city: body.city ?? undefined,
          state: body.state ?? undefined,
          address: body.address ?? undefined,
          status: body.status,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the site.");
    }
  });

  const saving = isSubmitting || createSite.isPending || updateSite.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={MapPin}
      title={isEdit ? "Edit site" : "New site"}
      description={isEdit ? site?.name : "Create a site. Add members from the Users page."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormRow columns={2}>
          <Field label="Name" htmlFor="site-name" required error={errors.name?.message}>
            <Input id="site-name" {...register("name")} />
          </Field>
          <Field label="Code" htmlFor="site-code" error={errors.code?.message}>
            <Input id="site-code" placeholder="Optional" {...register("code")} />
          </Field>
          <Field label="City" htmlFor="site-city" error={errors.city?.message}>
            <Input id="site-city" {...register("city")} />
          </Field>
          <Field label="State" htmlFor="site-state" error={errors.state?.message}>
            <Input id="site-state" {...register("state")} />
          </Field>
          <Field
            label="Status"
            htmlFor="site-status"
            error={errors.status?.message}
            className="sm:col-span-2"
          >
            <Select id="site-status" {...register("status")}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>

        <Field label="Address" htmlFor="site-address" error={errors.address?.message}>
          <textarea
            id="site-address"
            rows={2}
            placeholder="Optional"
            className="flex min-h-[72px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
            {...register("address")}
          />
        </Field>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </form>
    </Modal>
  );
}
