"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  type CreateWorkerInput,
  type UpdateWorkerInput,
  type Worker,
  useCreateWorker,
  useCreateWorkerCategory,
  useUpdateWorker,
  useWorkerCategories,
} from "@/lib/hooks/use-attendance";
import { HardHat, Plus } from "lucide-react";
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
  const { data: categories } = useWorkerCategories();
  const createCategory = useCreateWorkerCategory();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dailyWage, setDailyWage] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Inline "add category" state.
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(worker?.name ?? "");
    setPhone(worker?.phone ?? "");
    setCategoryId(worker?.categoryId ?? "");
    setDailyWage(worker?.dailyWage != null ? String(worker.dailyWage) : "");
    setOvertimeRate(worker?.overtimeRate != null ? String(worker.overtimeRate) : "");
    setNotes(worker?.notes ?? "");
    setAddingCategory(false);
    setNewCategory("");
  }, [open, worker]);

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const created = await createCategory.mutateAsync(trimmed);
      setCategoryId(created.id);
      setAddingCategory(false);
      setNewCategory("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add the category.");
    }
  };

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

    const common = {
      name: name.trim(),
      dailyWage: wage,
      phone: phone.trim() || null,
      categoryId: categoryId || null,
      overtimeRate: ot,
      notes: notes.trim() || null,
    };

    try {
      if (isEdit && worker) {
        await updateWorker.mutateAsync({ id: worker.id, body: common as UpdateWorkerInput });
      } else {
        await createWorker.mutateAsync(common as CreateWorkerInput);
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
            <Label htmlFor="wk-category">Category</Label>
            {addingCategory ? (
              <div className="flex gap-2">
                <Input
                  id="wk-new-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  placeholder="New category"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCategory}
                  disabled={createCategory.isPending || !newCategory.trim()}
                >
                  {createCategory.isPending ? "…" : "Add"}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select
                  id="wk-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">— Select —</option>
                  {(categories ?? []).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddingCategory(true)}
                  title="Add a new category"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wk-phone">Mobile number</Label>
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
