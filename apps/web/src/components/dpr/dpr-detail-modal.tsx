"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import { type DprRow, type DprStatus, useApproveDpr, useDpr } from "@/lib/hooks/use-dpr";
import { ImageOff, Loader2 } from "lucide-react";
import { useState } from "react";

const STATUS_META: Record<DprStatus, { label: string; variant: BadgeProps["variant"] }> = {
  submitted: { label: "Submitted", variant: "brand" },
  approved: { label: "Locked", variant: "success" },
};

interface DprDetailModalProps {
  dprId: string | null;
  onClose: () => void;
  onEdit: (dpr: DprRow) => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

export function DprDetailModal({ dprId, onClose, onEdit }: DprDetailModalProps) {
  const { can, user, activeSite } = useAuth();
  const { data: dpr, isLoading } = useDpr(dprId);
  const approveDpr = useApproveDpr();
  const [error, setError] = useState<string | null>(null);

  const canApprove = can("dpr", "approve");
  const isSiteOwner = activeSite?.role === "owner";
  const isMine = !!dpr && dpr.createdBy?.id === user?.id;
  // The uploader (or site owner) can edit until the report is locked.
  const editable = !!dpr && dpr.status !== "approved" && (isSiteOwner || isMine);

  const onApprove = async () => {
    if (!dpr) return;
    setError(null);
    try {
      await approveDpr.mutateAsync(dpr.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not lock the report.");
    }
  };

  const meta = dpr ? (STATUS_META[dpr.status] ?? STATUS_META.submitted) : null;

  return (
    <Modal
      open={!!dprId}
      onClose={onClose}
      title={dpr ? `Report — ${dpr.reportDate}` : "Report"}
      description={dpr?.workCategory ?? undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {dpr && editable ? (
            <Button variant="outline" onClick={() => onEdit(dpr)}>
              Edit
            </Button>
          ) : null}
          {dpr && canApprove && dpr.status !== "approved" ? (
            <Button onClick={onApprove} disabled={approveDpr.isPending}>
              {approveDpr.isPending ? "Locking…" : "Lock"}
            </Button>
          ) : null}
        </>
      }
    >
      {isLoading || !dpr ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {meta ? <Badge variant={meta.variant}>{meta.label}</Badge> : null}
            {dpr.createdBy ? (
              <span className="text-xs text-muted-foreground">by {dpr.createdBy.name}</span>
            ) : null}
            {dpr.approvedBy ? (
              <span className="text-xs text-muted-foreground">
                · locked by {dpr.approvedBy.name}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Location" value={dpr.location} />
            <Field
              label="Quantity"
              value={
                dpr.quantityValue != null
                  ? `${dpr.quantityValue}${dpr.quantityUnit ? ` ${dpr.quantityUnit}` : ""}`
                  : null
              }
            />
            <Field label="Completed work" value={dpr.completedWork} />
            <Field label="Pending work" value={dpr.pendingWork} />
          </div>
          <Field label="Remarks" value={dpr.remarks} />

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Photos ({dpr.photos.length})
            </p>
            {dpr.photos.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No photos.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {dpr.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="relative aspect-square overflow-hidden rounded-md border bg-muted"
                  >
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.url}
                        alt={photo.fileName ?? "DPR photo"}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                        <ImageOff className="size-5" />
                        <span className="text-[10px]">unavailable</span>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
