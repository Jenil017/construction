"use client";

import { Button } from "@/components/ui/button";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  type CreateExpenseInput,
  type Expense,
  type UpdateExpenseInput,
  useCreateExpense,
  useUpdateExpense,
} from "@/lib/hooks/use-expenses";
import { formMoney, optionalStringMax, requiredString } from "@/lib/validation/forms";
import { PAYMENT_MODES, pastOrTodayOrBlankSchema, today } from "@construction-erp/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
}

const CATEGORIES = [
  // Site operations
  "Fuel",
  "Generator fuel",
  "Equipment hire",
  "Tools & Small equipment",
  "Repairs & Maintenance",
  "Site cleaning",
  // Labour
  "Labour (extra)",
  "Skilled labour",
  "Unskilled labour",
  "Subcontractor payment",
  // Logistics
  "Transport",
  "Vehicle hire",
  "Loading / unloading",
  // Site overhead
  "Food & Tea",
  "Safety & PPE",
  "Permit & License",
  "Medical & First aid",
  "Office & Stationery",
  // Other
  "Miscellaneous",
];

/** Mirrors the API's expense schema (`createExpenseBodySchema`); maxes track the DB columns. */
const expenseFormSchema = z.object({
  expenseDate: pastOrTodayOrBlankSchema,
  amount: formMoney({ allowZero: false }),
  category: requiredString(80, "Category is required."),
  paymentMode: z.enum(PAYMENT_MODES),
  paidTo: optionalStringMax(160),
  description: optionalStringMax(300),
  isPettyCash: z.boolean(),
});

/** The raw form values are all strings; the schema output is what the API takes. */
type ExpenseFormValues = z.input<typeof expenseFormSchema>;

const EMPTY: ExpenseFormValues = {
  expenseDate: today(),
  amount: "",
  category: "",
  paymentMode: "Cash",
  paidTo: "",
  description: "",
  isPettyCash: false,
};

export function ExpenseFormModal({ open, onClose, expense }: ExpenseFormModalProps) {
  const isEdit = !!expense;
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(
      expense
        ? {
            expenseDate: expense.expenseDate,
            amount: String(expense.amount),
            category: expense.category,
            paymentMode: (PAYMENT_MODES.find((m) => m === expense.paymentMode) ??
              "Cash") as ExpenseFormValues["paymentMode"],
            paidTo: expense.paidTo ?? "",
            description: expense.description ?? "",
            isPettyCash: expense.isPettyCash,
          }
        : EMPTY,
    );
  }, [open, expense, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    // `values` is the schema *output*: trimmed, coerced, "" already mapped to null.
    const body = values as unknown as CreateExpenseInput & UpdateExpenseInput;
    try {
      if (isEdit && expense) await updateExpense.mutateAsync({ id: expense.id, body });
      else await createExpense.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the expense.");
    }
  });

  const busy = isSubmitting || createExpense.isPending || updateExpense.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Receipt}
      title={isEdit ? "Edit expense" : "New expense"}
      description={isEdit ? "Only pending expenses can be edited." : "Record a site expense."}
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
          <Field label="Date" htmlFor="exp-date" error={errors.expenseDate?.message}>
            <Input id="exp-date" type="date" max={today()} {...register("expenseDate")} />
          </Field>
          <Field label="Amount (₹)" htmlFor="exp-amount" required error={errors.amount?.message}>
            <Input
              id="exp-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="e.g. 1500"
              {...register("amount")}
            />
          </Field>
        </FormRow>
        <FormRow columns={2}>
          <Field label="Category" htmlFor="exp-category" required error={errors.category?.message}>
            <Input
              id="exp-category"
              list="exp-categories"
              placeholder="Fuel, Food, Transport…"
              {...register("category")}
            />
            <datalist id="exp-categories">
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </Field>
          <Field label="Payment mode" htmlFor="exp-mode" error={errors.paymentMode?.message}>
            <Select id="exp-mode" {...register("paymentMode")}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>
        <Field label="Paid to" htmlFor="exp-paidto" error={errors.paidTo?.message}>
          <Input id="exp-paidto" placeholder="Who was paid (optional)" {...register("paidTo")} />
        </Field>
        <Field label="Description" htmlFor="exp-desc" error={errors.description?.message}>
          <Input id="exp-desc" placeholder="Optional" {...register("description")} />
        </Field>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-sm font-medium">
          <input type="checkbox" className="size-4" {...register("isPettyCash")} />
          Mark as petty cash
        </label>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
