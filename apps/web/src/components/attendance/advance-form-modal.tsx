"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { type Worker, useCreateAdvance } from "@/lib/hooks/use-attendance";
import { useEffect, useState } from "react";

interface AdvanceFormModalProps {
  open: boolean;
  onClose: () => void;
  workers: Worker[];
  /** Pre-select a worker (e.g. opened from a worker's detail). */
  workerId?: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdvanceFormModal({ open, onClose, workers, workerId }: AdvanceFormModalProps) {
  const createAdvance = useCreateAdvance();

  const [selectedWorker, setSelectedWorker] = useState("");
  const [amount, setAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedWorker(workerId ?? "");
    setAmount("");
    setAdvanceDate(today());
    setNote("");
    setError(null);
  }, [open, workerId]);

  const submit = async () => {
    setError(null);
    if (!selectedWorker) {
      setError("Select a worker.");
      return;
    }
    const amt = Number(amount.trim());
    if (!amount.trim() || Number.isNaN(amt) || amt <= 0) {
      setError("Enter an advance amount greater than zero.");
      return;
    }
    try {
      await createAdvance.mutateAsync({
        workerId: selectedWorker,
        amount: amt,
        advanceDate,
        note: note.trim() || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the advance.");
    }
  };

  const busy = createAdvance.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record advance"
      description="Advances are deducted from net pay at the next salary run."
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
        <div className="space-y-1.5">
          <Label htmlFor="adv-worker">Worker</Label>
          <Select
            id="adv-worker"
            value={selectedWorker}
            onChange={(e) => setSelectedWorker(e.target.value)}
            disabled={!!workerId}
          >
            <option value="">Select a worker…</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.trade ? ` · ${w.trade}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="adv-amount">Amount (₹)</Label>
            <Input
              id="adv-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 2000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-date">Date</Label>
            <Input
              id="adv-date"
              type="date"
              value={advanceDate}
              onChange={(e) => setAdvanceDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adv-note">Note</Label>
          <Input
            id="adv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </div>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
