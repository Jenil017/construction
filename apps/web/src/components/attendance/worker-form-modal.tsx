"use client";

import { Button } from "@/components/ui/button";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import {
  formMoney,
  formOptionalMoney,
  formOptionalPhone,
  optionalString,
  optionalStringMax,
  requiredString,
} from "@/lib/validation/forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { HardHat, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface WorkerFormModalProps {
  open: boolean;
  onClose: () => void;
  worker?: Worker | null;
}

/** Mirrors the API's worker schema (`createWorkerBodySchema`); maxes track the DB columns. */
const workerFormSchema = z.object({
  name: requiredString(160, "Enter the worker's name."),
  categoryId: optionalString,
  phone: formOptionalPhone,
  dailyWage: formMoney(),
  overtimeRate: formOptionalMoney(),
  notes: optionalStringMax(2000),
});

/** The raw form values are all strings; the schema output is what the API takes. */
type WorkerFormValues = z.input<typeof workerFormSchema>;

const EMPTY: WorkerFormValues = {
  name: "",
  categoryId: "",
  phone: "",
  dailyWage: "",
  overtimeRate: "",
  notes: "",
};

export function WorkerFormModal({ open, onClose, worker }: WorkerFormModalProps) {
  const isEdit = !!worker;
  const createWorker = useCreateWorker();
  const updateWorker = useUpdateWorker();
  const { data: categories } = useWorkerCategories();
  const createCategory = useCreateWorkerCategory();

  const [error, setError] = useState<string | null>(null);

  // Inline "add category" state.
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WorkerFormValues>({
    resolver: zodResolver(workerFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAddingCategory(false);
    setNewCategory("");
    reset(
      worker
        ? {
            name: worker.name,
            categoryId: worker.categoryId ?? "",
            phone: worker.phone ?? "",
            dailyWage: String(worker.dailyWage),
            overtimeRate: worker.overtimeRate != null ? String(worker.overtimeRate) : "",
            notes: worker.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, worker, reset]);

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const created = await createCategory.mutateAsync(trimmed);
      setValue("categoryId", created.id);
      setAddingCategory(false);
      setNewCategory("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add the category.");
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    // `values` is the schema *output*: trimmed, "" already mapped to null.
    const body = values as unknown as CreateWorkerInput & UpdateWorkerInput;
    try {
      if (isEdit && worker) await updateWorker.mutateAsync({ id: worker.id, body });
      else await createWorker.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the worker.");
    }
  });

  const busy = isSubmitting || createWorker.isPending || updateWorker.isPending;

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
            htmlFor="wk-name"
            required
            error={errors.name?.message}
            className="sm:col-span-2"
          >
            <Input id="wk-name" placeholder="e.g. Ramesh Patel" {...register("name")} />
          </Field>

          <Field label="Category" htmlFor="wk-category" error={errors.categoryId?.message}>
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
                <Select id="wk-category" className="flex-1" {...register("categoryId")}>
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
          </Field>

          <Field label="Mobile number" htmlFor="wk-phone" error={errors.phone?.message}>
            <Input
              id="wk-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="Optional"
              {...register("phone")}
            />
          </Field>

          <Field
            label="Daily wage (₹)"
            htmlFor="wk-wage"
            required
            error={errors.dailyWage?.message}
          >
            <Input
              id="wk-wage"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="e.g. 600"
              {...register("dailyWage")}
            />
          </Field>

          <Field label="Overtime rate (₹/hr)" htmlFor="wk-ot" error={errors.overtimeRate?.message}>
            <Input
              id="wk-ot"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="Optional"
              {...register("overtimeRate")}
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="wk-notes"
            error={errors.notes?.message}
            className="sm:col-span-2"
          >
            <Input id="wk-notes" placeholder="Optional" {...register("notes")} />
          </Field>
        </FormRow>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </form>
    </Modal>
  );
}
