"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import { useGenerateRun } from "@/lib/hooks/use-salary";
import { useEffect, useState } from "react";

interface GenerateRunModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (runId: string) => void;
}

function monthStart(): string {
  return `${new Date().toISOString().slice(0, 8)}01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GenerateRunModal({ open, onClose, onGenerated }: GenerateRunModalProps) {
  const generate = useGenerateRun();
  const [periodStart, setPeriodStart] = useState(monthStart());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeriodStart(monthStart());
    setPeriodEnd(today());
    setError(null);
  }, [open]);

  const submit = async () => {
    setError(null);
    if (!periodStart || !periodEnd) {
      setError("Select a start and end date.");
      return;
    }
    if (periodStart > periodEnd) {
      setError("The start date must be on or before the end date.");
      return;
    }
    try {
      const run = await generate.mutateAsync({ periodStart, periodEnd });
      onGenerated(run.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate the salary run.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate salary run"
      description="Pay is computed from approved attendance in the period; advances are deducted."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={generate.isPending}>
            {generate.isPending ? "Generating…" : "Generate"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="run-start">Period start</Label>
            <Input
              id="run-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="run-end">Period end</Label>
            <Input
              id="run-end"
              type="date"
              max={today()}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Only <strong>approved</strong> attendance is included. Approve the days first in the
          Attendance screen.
        </p>
        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
