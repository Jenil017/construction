"use client";

import { Button } from "@/components/ui/button";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  type CreateSaleInput,
  type SiteSale,
  type UpdateSaleInput,
  useCreateSale,
  useUpdateSale,
} from "@/lib/hooks/use-selling";
import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

interface SaleFormModalProps {
  open: boolean;
  onClose: () => void;
  sale?: SiteSale | null;
}

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];
const CATEGORIES = [
  "Scrap Metal",
  "Surplus Material",
  "Sand / Aggregate",
  "Timber / Wood",
  "Bricks / Blocks",
  "Cement Bags",
  "Equipment",
  "Debris",
  "Other",
];
const UNITS = ["kg", "ton", "piece", "bag", "truck load", "bundle", "sq ft", "cu ft", "litre"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SaleFormModal({ open, onClose, sale }: SaleFormModalProps) {
  const isEdit = !!sale;
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();

  const [saleDate, setSaleDate] = useState(today());
  const [itemDescription, setItemDescription] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [ratePerUnit, setRatePerUnit] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const computedTotal =
    Number(quantity) > 0 && Number(ratePerUnit) >= 0
      ? (Number(quantity) * Number(ratePerUnit)).toFixed(2)
      : null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaleDate(sale?.saleDate ?? today());
    setItemDescription(sale?.itemDescription ?? "");
    setCategory(sale?.category ?? "");
    setQuantity(sale?.quantity != null ? String(sale.quantity) : "");
    setUnit(sale?.unit ?? "kg");
    setRatePerUnit(sale?.ratePerUnit != null ? String(sale.ratePerUnit) : "");
    setAmountReceived("");
    setBuyerName(sale?.buyerName ?? "");
    setBuyerContact(sale?.buyerContact ?? "");
    setPaymentMode(sale?.paymentMode ?? "Cash");
    setNotes(sale?.notes ?? "");
  }, [open, sale]);

  const submit = async () => {
    setError(null);
    if (!itemDescription.trim()) {
      setError("Item description is required.");
      return;
    }
    if (!category.trim()) {
      setError("Category is required.");
      return;
    }
    const qty = Number(quantity);
    if (!quantity || Number.isNaN(qty) || qty <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    const rate = Number(ratePerUnit);
    if (ratePerUnit === "" || Number.isNaN(rate) || rate < 0) {
      setError("Enter a valid rate per unit (can be 0 for donated/disposed items).");
      return;
    }
    const received = Number(amountReceived) || 0;
    const body: CreateSaleInput & UpdateSaleInput = {
      saleDate,
      itemDescription: itemDescription.trim(),
      category: category.trim(),
      quantity: qty,
      unit,
      ratePerUnit: rate,
      buyerName: buyerName.trim() || null,
      buyerContact: buyerContact.trim() || null,
      paymentMode,
      ...(!isEdit && received > 0 ? { amountReceived: received } : {}),
      notes: notes.trim() || null,
    };

    try {
      if (isEdit && sale) await updateSale.mutateAsync({ id: sale.id, body });
      else await createSale.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the sale record.");
    }
  };

  const busy = createSale.isPending || updateSale.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ShoppingBag}
      title={isEdit ? "Edit sale record" : "New sale record"}
      description={isEdit ? "Update sale details." : "Record a material sold from the site."}
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
          <Field label="Sale date" htmlFor="sale-date">
            <Input
              id="sale-date"
              type="date"
              max={today()}
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </Field>
          <Field label="Category" htmlFor="sale-category" required>
            <Input
              id="sale-category"
              list="sale-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Scrap Metal, Surplus…"
            />
            <datalist id="sale-categories">
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </Field>
        </FormRow>

        <Field label="Item description" htmlFor="sale-item" required>
          <Input
            id="sale-item"
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            placeholder="e.g. MS scrap bars, surplus cement bags, old formwork timber…"
          />
        </Field>

        <FormRow columns={3}>
          <Field label="Quantity" htmlFor="sale-qty" required>
            <Input
              id="sale-qty"
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 50"
            />
          </Field>
          <Field label="Unit" htmlFor="sale-unit" required>
            <Input
              id="sale-unit"
              list="sale-units"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="kg, ton, piece…"
            />
            <datalist id="sale-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="Rate / unit (₹)" htmlFor="sale-rate" required>
            <Input
              id="sale-rate"
              type="number"
              min="0"
              step="any"
              value={ratePerUnit}
              onChange={(e) => setRatePerUnit(e.target.value)}
              placeholder="e.g. 35"
            />
          </Field>
        </FormRow>

        {computedTotal !== null ? (
          <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total amount: </span>
            <span className="font-semibold tabular-nums">₹{computedTotal}</span>
          </div>
        ) : null}

        <FormRow columns={2}>
          <Field label="Buyer name" htmlFor="sale-buyer">
            <Input
              id="sale-buyer"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Name of the buyer (optional)"
            />
          </Field>
          <Field label="Buyer contact" htmlFor="sale-contact">
            <Input
              id="sale-contact"
              value={buyerContact}
              onChange={(e) => setBuyerContact(e.target.value)}
              placeholder="Phone number (optional)"
            />
          </Field>
        </FormRow>

        <FormRow columns={2}>
          <Field label="Payment mode" htmlFor="sale-mode">
            <Select
              id="sale-mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          {!isEdit ? (
            <Field label="Amount received so far (₹)" htmlFor="sale-received">
              <Input
                id="sale-received"
                type="number"
                min="0"
                step="any"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="0 — enter if already received"
              />
            </Field>
          ) : null}
        </FormRow>

        <Field label="Notes" htmlFor="sale-notes">
          <Input
            id="sale-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details (optional)"
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
