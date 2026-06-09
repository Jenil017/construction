"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type CreateWorkerInput,
  type UpdateWorkerInput,
  type Worker,
  useCreateWorker,
  useUpdateWorker,
} from "@/lib/hooks/use-attendance";
import { HardHat } from "lucide-react";
import { useEffect, useState } from "react";

interface WorkerFormModalProps {
  open: boolean;
  onClose: () => void;
  worker?: Worker | null;
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return Number(trimmed);
}

export function WorkerFormModal({ open, onClose, worker }: WorkerFormModalProps) {
  const isEdit = !!worker;
  const createWorker = useCreateWorker();
  const updateWorker = useUpdateWorker();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState("");
  const [dailyWage, setDailyWage] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(worker?.name ?? "");
    setPhone(worker?.phone ?? "");
    setTrade(worker?.trade ?? "");
    setDailyWage(worker?.dailyWage != null ? String(worker.dailyWage) : "");
    setOvertimeRate(worker?.overtimeRate != null ? String(worker.overtimeRate) : "");
    setNotes(worker?.notes ?? "");
  }, [open, worker]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Worker name is required.");
      return;
    }
    const wage = parseOptionalNumber(dailyWage);
    if (wage == null || Number.isNaN(wage) || wage < 0) {
      setError("Daily wage must be a non-negative number.");
      return;
    }
    const ot = parseOptionalNumber(overtimeRate);
    if (ot != null && (Number.isNaN(ot) || ot < 0)) {
      setError("Overtime rate must be a non-negative number.");
      return;
    }

    try {
      if (isEdit && worker) {
        const body: UpdateWorkerInput = {
          name: name.trim(),
          dailyWage: wage,
          phone: phone.trim() || null,
          trade: trade.trim() || null,
          overtimeRate: ot,
          notes: notes.trim() || null,
        };
        await updateWorker.mutateAsync({ id: worker.id, body });
      } else {
        const body: CreateWorkerInput = {
          name: name.trim(),
          dailyWage: wage,
          phone: phone.trim() || null,
          trade: trade.trim() || null,
          overtimeRate: ot,
          notes: notes.trim() || null,
        };
        await createWorker.mutateAsync(body);
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the worker.");
    }
  };

  const busy = createWorker.isPending || updateWorker.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={HardHat}
      title={isEdit ? "Edit worker" : "New worker"}
      description={isEdit ? worker?.name : "Add a worker to this site."}
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wk-name">Name</Label>
            <Input
              id="wk-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Patel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wk-trade">Trade</Label>
            <Input
              id="wk-trade"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              placeholder="Mason, Helper, Carpenter…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wk-phone">Phone</Label>
            <Input
              id="wk-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wk-wage">Daily wage (₹)</Label>
            <Input
              id="wk-wage"
              type="number"
              min="0"
              step="any"
              value={dailyWage}
              onChange={(e) => setDailyWage(e.target.value)}
              placeholder="e.g. 600"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wk-ot">Overtime rate (₹/hr)</Label>
            <Input
              id="wk-ot"
              type="number"
              min="0"
              step="any"
              value={overtimeRate}
              onChange={(e) => setOvertimeRate(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wk-notes">Notes</Label>
            <Input
              id="wk-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
