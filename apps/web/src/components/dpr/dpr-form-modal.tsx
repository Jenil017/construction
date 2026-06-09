"use client";

import { Button } from "@/components/ui/button";
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
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface DprFormModalProps {
  open: boolean;
  onClose: () => void;
  dpr?: DprRow | null;
}

interface PendingPhoto {
  id: string;
  file: File;
  url: string;
}

const textareaClass =
  "flex min-h-[72px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DprFormModal({ open, onClose, dpr }: DprFormModalProps) {
  const isEdit = !!dpr;
  const createDpr = useCreateDpr();
  const updateDpr = useUpdateDpr();
  const uploadPhoto = useUploadDprPhoto();
  const deletePhoto = useDeleteDprPhoto();

  const cameraRef = useRef<HTMLInputElement>(null);
  const deviceRef = useRef<HTMLInputElement>(null);

  const [reportDate, setReportDate] = useState(today());
  const [workCategory, setWorkCategory] = useState("");
  const [location, setLocation] = useState("");
  const [completedWork, setCompletedWork] = useState("");
  const [pendingWork, setPendingWork] = useState("");
  const [quantityValue, setQuantityValue] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [remarks, setRemarks] = useState("");
  const [status, setStatus] = useState<"draft" | "submitted">("draft");

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
    setReportDate(dpr?.reportDate ?? today());
    setWorkCategory(dpr?.workCategory ?? "");
    setLocation(dpr?.location ?? "");
    setCompletedWork(dpr?.completedWork ?? "");
    setPendingWork(dpr?.pendingWork ?? "");
    setQuantityValue(dpr?.quantityValue != null ? String(dpr.quantityValue) : "");
    setQuantityUnit(dpr?.quantityUnit ?? "");
    setRemarks(dpr?.remarks ?? "");
    setStatus(dpr?.status === "submitted" ? "submitted" : "draft");
    setExisting(dpr?.photos ?? []);
    setRemovedIds([]);
    setPending([]);
    setCommittedId(dpr?.id ?? null);
  }, [open, dpr]);

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

  const submit = async () => {
    setError(null);
    if (!reportDate) {
      setError("Report date is required.");
      return;
    }
    const qty = quantityValue.trim() === "" ? null : Number(quantityValue);
    if (qty != null && (Number.isNaN(qty) || qty < 0)) {
      setError("Quantity must be a non-negative number.");
      return;
    }

    const payload: CreateDprInput = {
      reportDate,
      workCategory: workCategory.trim() || null,
      location: location.trim() || null,
      completedWork: completedWork.trim() || null,
      pendingWork: pendingWork.trim() || null,
      quantityValue: qty,
      quantityUnit: quantityUnit.trim() || null,
      remarks: remarks.trim() || null,
      status,
    };

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
  };

  const busy = createDpr.isPending || updateDpr.isPending || uploadPhoto.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
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
          <div className="space-y-1.5">
            <Label htmlFor="dpr-date">Date</Label>
            <Input
              id="dpr-date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dpr-category">Work category</Label>
            <Input
              id="dpr-category"
              value={workCategory}
              onChange={(e) => setWorkCategory(e.target.value)}
              placeholder="e.g. RCC, Brickwork"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dpr-location">Floor / area / location</Label>
            <Input
              id="dpr-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. 3rd floor, Block A"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dpr-completed">Completed work</Label>
          <textarea
            id="dpr-completed"
            value={completedWork}
            onChange={(e) => setCompletedWork(e.target.value)}
            rows={2}
            className={textareaClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dpr-pending">Pending work</Label>
          <textarea
            id="dpr-pending"
            value={pendingWork}
            onChange={(e) => setPendingWork(e.target.value)}
            rows={2}
            className={textareaClass}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dpr-qty">Quantity</Label>
            <Input
              id="dpr-qty"
              type="number"
              min="0"
              step="any"
              value={quantityValue}
              onChange={(e) => setQuantityValue(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dpr-unit">Unit</Label>
            <Input
              id="dpr-unit"
              value={quantityUnit}
              onChange={(e) => setQuantityUnit(e.target.value)}
              placeholder="e.g. cum, sqm, bags"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dpr-remarks">Remarks</Label>
          <textarea
            id="dpr-remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Optional"
            className={textareaClass}
          />
        </div>

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
                    className="absolute right-1 top-1 rounded-md bg-foreground/60 p-1 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
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
                    className="absolute right-1 top-1 rounded-md bg-foreground/60 p-1 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
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

        <div className="space-y-1.5">
          <Label>Save as</Label>
          <div className="flex gap-2">
            {(["draft", "submitted"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                  status === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
