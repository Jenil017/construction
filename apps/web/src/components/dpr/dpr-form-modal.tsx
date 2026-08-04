"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type CreateDprInput,
  type DprPhoto,
  type DprRow,
  type UpdateDprInput,
  useCreateDpr,
  useDeleteDprPhoto,
  useUpdateDpr,
  useUploadDprPhoto,
} from "@/lib/hooks/use-dpr";
import { formOptionalQuantity, optionalStringMax } from "@/lib/validation/forms";
import { pastOrTodayOrBlankSchema, today } from "@construction-erp/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, ClipboardList, ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface DprFormModalProps {
  open: boolean;
  onClose: () => void;
  dpr?: DprRow | null;
}

/**
 * Mirrors `dpr.schemas.ts`. The report date cannot be in the future — a DPR
 * records work that has happened. Maxes track the DB column widths.
 */
const dprFormSchema = z.object({
  reportDate: pastOrTodayOrBlankSchema,
  workCategory: optionalStringMax(120),
  location: optionalStringMax(200),
  completedWork: optionalStringMax(2000),
  pendingWork: optionalStringMax(2000),
  quantityValue: formOptionalQuantity({ allowZero: true }),
  quantityUnit: optionalStringMax(40),
  remarks: optionalStringMax(2000),
});

type DprFormValues = z.input<typeof dprFormSchema>;

interface PendingPhoto {
  id: string;
  file: File;
  url: string;
}

const textareaClass =
  "flex min-h-[72px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50";

export function DprFormModal({ open, onClose, dpr }: DprFormModalProps) {
  const isEdit = !!dpr;
  const createDpr = useCreateDpr();
  const updateDpr = useUpdateDpr();
  const uploadPhoto = useUploadDprPhoto();
  const deletePhoto = useDeleteDprPhoto();

  const cameraRef = useRef<HTMLInputElement>(null);
  const deviceRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DprFormValues>({
    resolver: zodResolver(dprFormSchema),
    defaultValues: {
      reportDate: today(),
      workCategory: "",
      location: "",
      completedWork: "",
      pendingWork: "",
      quantityValue: "",
      quantityUnit: "",
      remarks: "",
    },
  });

  // Photos already saved (edit mode) and ones picked but not yet uploaded.
  const [existing, setExisting] = useState<DprPhoto[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  // The id of the report once created — guards against re-creating on retry.
  const [committedId, setCommittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset({
      reportDate: dpr?.reportDate ?? today(),
      workCategory: dpr?.workCategory ?? "",
      location: dpr?.location ?? "",
      completedWork: dpr?.completedWork ?? "",
      pendingWork: dpr?.pendingWork ?? "",
      quantityValue: dpr?.quantityValue != null ? String(dpr.quantityValue) : "",
      quantityUnit: dpr?.quantityUnit ?? "",
      remarks: dpr?.remarks ?? "",
    });
    setExisting(dpr?.photos ?? []);
    setRemovedIds([]);
    setPending([]);
    setCommittedId(dpr?.id ?? null);
  }, [open, dpr, reset]);

  // Release object URLs when the modal closes / unmounts.
  useEffect(() => {
    if (open) return;
    setPending((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [];
    });
  }, [open]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
    }));
    setPending((prev) => [...prev, ...next]);
  };

  const removePending = (id: string) => {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const visibleExisting = existing.filter((p) => !removedIds.includes(p.id));

  const submit = handleSubmit(async (values) => {
    setError(null);
    // `values` is the schema output: trimmed, blanks already mapped to null.
    const payload = values as unknown as CreateDprInput;

    try {
      // 1. Create once (or update); reuse the id on retry so we never duplicate.
      let id = committedId;
      if (id) {
        await updateDpr.mutateAsync({ id, body: payload as UpdateDprInput });
      } else {
        const created = await createDpr.mutateAsync(payload);
        id = created.id;
        setCommittedId(id);
      }

      // 2. Apply photo removals (edit).
      for (const photoId of removedIds) {
        await deletePhoto.mutateAsync({ dprId: id, photoId });
      }
      setExisting((prev) => prev.filter((p) => !removedIds.includes(p.id)));
      setRemovedIds([]);

      // 3. Upload new photos; keep any that fail so the user can retry.
      const failed: PendingPhoto[] = [];
      for (const p of pending) {
        try {
          await uploadPhoto.mutateAsync({ dprId: id, file: p.file });
          URL.revokeObjectURL(p.url);
        } catch {
          failed.push(p);
        }
      }
      if (failed.length > 0) {
        setPending(failed);
        setError(
          `Report saved, but ${failed.length} photo(s) didn't upload. Tap Save to retry. If it keeps failing, the storage bucket may need its CORS policy set.`,
        );
        return;
      }

      setPending([]);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the report.");
    }
  });

  const busy = isSubmitting || createDpr.isPending || updateDpr.isPending || uploadPhoto.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ClipboardList}
      title={isEdit ? "Edit report" : "New report"}
      description={isEdit ? dpr?.reportDate : "Record today's site progress with photos."}
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
          <Field label="Date" htmlFor="dpr-date" required error={errors.reportDate?.message}>
            <Input id="dpr-date" type="date" max={today()} {...register("reportDate")} />
          </Field>
          <Field label="Work category" htmlFor="dpr-category" error={errors.workCategory?.message}>
            <Input
              id="dpr-category"
              placeholder="e.g. RCC, Brickwork"
              {...register("workCategory")}
            />
          </Field>
          <Field
            label="Floor / area / location"
            htmlFor="dpr-location"
            error={errors.location?.message}
            className="sm:col-span-2"
          >
            <Input
              id="dpr-location"
              placeholder="e.g. 3rd floor, Block A"
              {...register("location")}
            />
          </Field>
        </div>

        <Field label="Completed work" htmlFor="dpr-completed" error={errors.completedWork?.message}>
          <textarea
            id="dpr-completed"
            rows={2}
            className={textareaClass}
            {...register("completedWork")}
          />
        </Field>
        <Field label="Pending work" htmlFor="dpr-pending" error={errors.pendingWork?.message}>
          <textarea
            id="dpr-pending"
            rows={2}
            className={textareaClass}
            {...register("pendingWork")}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantity" htmlFor="dpr-qty" error={errors.quantityValue?.message}>
            <Input
              id="dpr-qty"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="Optional"
              {...register("quantityValue")}
            />
          </Field>
          <Field label="Unit" htmlFor="dpr-unit" error={errors.quantityUnit?.message}>
            <Input id="dpr-unit" placeholder="e.g. cum, sqm, bags" {...register("quantityUnit")} />
          </Field>
        </div>

        <Field label="Remarks" htmlFor="dpr-remarks" error={errors.remarks?.message}>
          <textarea
            id="dpr-remarks"
            rows={2}
            placeholder="Optional"
            className={textareaClass}
            {...register("remarks")}
          />
        </Field>

        {/* Photos: camera or device, multiple allowed, with live previews. */}
        <div className="space-y-2">
          <Label>
            Photos{" "}
            {visibleExisting.length + pending.length > 0
              ? `(${visibleExisting.length + pending.length})`
              : ""}
          </Label>
          <div className="flex gap-2">
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={deviceRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => cameraRef.current?.click()}
              className="h-11 flex-1 sm:h-9 sm:flex-none"
            >
              <Camera className="size-4" />
              Take photo
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => deviceRef.current?.click()}
              className="h-11 flex-1 sm:h-9 sm:flex-none"
            >
              <ImagePlus className="size-4" />
              Upload from device
            </Button>
          </div>

          {visibleExisting.length === 0 && pending.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              Add site photos from the camera or your device.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {visibleExisting.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url ?? ""}
                    alt={photo.fileName ?? "DPR photo"}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setRemovedIds((prev) => [...prev, photo.id])}
                    className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-md bg-foreground/60 text-white transition-opacity hover:bg-danger [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.file.name} className="size-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-foreground/60 px-1 py-0.5 text-center text-[10px] text-white">
                    new
                  </span>
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => removePending(p.id)}
                    className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-md bg-foreground/60 text-white transition-opacity hover:bg-danger [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploadPhoto.isPending ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Uploading photos…
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
