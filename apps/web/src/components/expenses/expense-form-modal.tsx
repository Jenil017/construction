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
import { Receipt } from "lucide-react";
import { useEffect, useState } from "react";

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
}

const MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormModal({ open, onClose, expense }: ExpenseFormModalProps) {
  const isEdit = !!expense;
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();

  const [expenseDate, setExpenseDate] = useState(today());
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [isPettyCash, setIsPettyCash] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setExpenseDate(expense?.expenseDate ?? today());
    setCategory(expense?.category ?? "");
    setAmount(expense?.amount != null ? String(expense.amount) : "");
    setPaidTo(expense?.paidTo ?? "");
    setPaymentMode(expense?.paymentMode ?? "Cash");
    setIsPettyCash(expense?.isPettyCash ?? false);
    setDescription(expense?.description ?? "");
  }, [open, expense]);

  const submit = async () => {
    setError(null);
    if (!category.trim()) {
      setError("Category is required.");
      return;
    }
    const amt = Number(amount.trim());
    if (!amount.trim() || Number.isNaN(amt) || amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    const body: CreateExpenseInput & UpdateExpenseInput = {
      expenseDate,
      category: category.trim(),
      amount: amt,
      paidTo: paidTo.trim() || null,
      paymentMode,
      isPettyCash,
      description: description.trim() || null,
    };
    try {
      if (isEdit && expense) await updateExpense.mutateAsync({ id: expense.id, body });
      else await createExpense.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the expense.");
    }
  };

  const busy = createExpense.isPending || updateExpense.isPending;

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
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow columns={2}>
          <Field label="Date" htmlFor="exp-date">
            <Input
              id="exp-date"
              type="date"
              max={today()}
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </Field>
          <Field label="Amount (₹)" htmlFor="exp-amount" required>
            <Input
              id="exp-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1500"
            />
          </Field>
        </FormRow>
        <FormRow columns={2}>
          <Field label="Category" htmlFor="exp-category" required>
            <Input
              id="exp-category"
              list="exp-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Fuel, Food, Transport…"
            />
            <datalist id="exp-categories">
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </Field>
          <Field label="Payment mode" htmlFor="exp-mode">
            <Select
              id="exp-mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>
        <Field label="Paid to" htmlFor="exp-paidto">
          <Input
            id="exp-paidto"
            value={paidTo}
            onChange={(e) => setPaidTo(e.target.value)}
            placeholder="Who was paid (optional)"
          />
        </Field>
        <Field label="Description" htmlFor="exp-desc">
          <Input
            id="exp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-sm font-medium">
          <input
            type="checkbox"
            checked={isPettyCash}
            onChange={(e) => setIsPettyCash(e.target.checked)}
            className="size-4"
          />
          Mark as petty cash
        </label>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
