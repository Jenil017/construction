"use client";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import { type Worker, useCreateAdvance } from "@/lib/hooks/use-attendance";
import { Banknote } from "lucide-react";
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
      icon={Banknote}
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
        <Field label="Worker" htmlFor="adv-worker" required>
          <Combobox
            id="adv-worker"
            options={workers.map((w) => ({
              value: w.id,
              label: w.name,
              hint: w.trade ?? undefined,
            }))}
            value={selectedWorker}
            onChange={setSelectedWorker}
            disabled={!!workerId}
            placeholder="Select a worker…"
            searchPlaceholder="Search workers…"
            emptyText="No workers yet."
          />
        </Field>
        <FormRow columns={2}>
          <Field label="Amount (₹)" htmlFor="adv-amount" required>
            <Input
              id="adv-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 2000"
            />
          </Field>
          <Field label="Date" htmlFor="adv-date">
            <Input
              id="adv-date"
              type="date"
              value={advanceDate}
              onChange={(e) => setAdvanceDate(e.target.value)}
            />
          </Field>
        </FormRow>
        <Field label="Note" htmlFor="adv-note">
          <Input
            id="adv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </Field>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
