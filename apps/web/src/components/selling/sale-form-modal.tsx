"use client";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field, FormRow } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  type CreateSaleInput,
  type SiteSale,
  type UpdateSaleInput,
  useAvailableMaterials,
  useCreateSale,
  useUpdateSale,
} from "@/lib/hooks/use-selling";
import { ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface SaleFormModalProps {
  open: boolean;
  onClose: () => void;
  sale?: SiteSale | null;
}

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtQty(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

export function SaleFormModal({ open, onClose, sale }: SaleFormModalProps) {
  const isEdit = !!sale;
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();

  // Only the create flow needs the in-stock item list (item is locked on edit).
  const { data: materials, isLoading: materialsLoading } = useAvailableMaterials(open && !isEdit);

  const [saleDate, setSaleDate] = useState(today());
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [ratePerUnit, setRatePerUnit] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedMaterial = useMemo(
    () => materials?.find((m) => m.id === materialId) ?? null,
    [materials, materialId],
  );

  // Unit + available stock come from the chosen material (or the sale on edit).
  const unit = isEdit ? sale?.unit : selectedMaterial?.unit;
  const available = selectedMaterial?.currentStock ?? null;

  const options: ComboboxOption[] = useMemo(
    () =>
      (materials ?? []).map((m) => ({
        value: m.id,
        label: m.sku ? `${m.name} · ${m.sku}` : m.name,
        hint: `${fmtQty(m.currentStock)} ${m.unit}`,
      })),
    [materials],
  );

  const qtyNum = Number(quantity);
  const overStock = !isEdit && available != null && qtyNum > available;

  const computedTotal =
    qtyNum > 0 && Number(ratePerUnit) >= 0 ? (qtyNum * Number(ratePerUnit)).toFixed(2) : null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaleDate(sale?.saleDate ?? today());
    setMaterialId(sale?.materialId ?? "");
    setQuantity(sale?.quantity != null ? String(sale.quantity) : "");
    setRatePerUnit(sale?.ratePerUnit != null ? String(sale.ratePerUnit) : "");
    setAmountReceived("");
    setBuyerName(sale?.buyerName ?? "");
    setBuyerContact(sale?.buyerContact ?? "");
    setPaymentMode(sale?.paymentMode ?? "Cash");
    setNotes(sale?.notes ?? "");
  }, [open, sale]);

  const submit = async () => {
    setError(null);

    if (!isEdit) {
      if (!materialId) {
        setError("Select an item to sell.");
        return;
      }
      if (!quantity || Number.isNaN(qtyNum) || qtyNum <= 0) {
        setError("Enter a quantity greater than zero.");
        return;
      }
      if (available != null && qtyNum > available) {
        setError(`Only ${fmtQty(available)} ${unit ?? ""} in stock.`);
        return;
      }
    }

    const rate = Number(ratePerUnit);
    if (ratePerUnit === "" || Number.isNaN(rate) || rate < 0) {
      setError("Enter a valid rate per unit (can be 0 for donated/disposed items).");
      return;
    }

    try {
      if (isEdit && sale) {
        const body: UpdateSaleInput = {
          saleDate,
          ratePerUnit: rate,
          buyerName: buyerName.trim() || null,
          buyerContact: buyerContact.trim() || null,
          paymentMode,
          notes: notes.trim() || null,
        };
        await updateSale.mutateAsync({ id: sale.id, body });
      } else {
        const received = Number(amountReceived) || 0;
        const body: CreateSaleInput = {
          saleDate,
          materialId,
          quantity: qtyNum,
          ratePerUnit: rate,
          buyerName: buyerName.trim() || null,
          buyerContact: buyerContact.trim() || null,
          paymentMode,
          ...(received > 0 ? { amountReceived: received } : {}),
          notes: notes.trim() || null,
        };
        await createSale.mutateAsync(body);
      }
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
      description={
        isEdit
          ? "Update sale details. The item and quantity are fixed."
          : "Sell an item from your inventory — stock is deducted automatically."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || overStock}>
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
          <Field label="Item" htmlFor="sale-item" required>
            {isEdit ? (
              <Input id="sale-item" value={sale?.itemDescription ?? ""} disabled />
            ) : (
              <Combobox
                id="sale-item"
                options={options}
                value={materialId}
                onChange={setMaterialId}
                disabled={materialsLoading}
                placeholder={materialsLoading ? "Loading items…" : "Select an item…"}
                searchPlaceholder="Type to search inventory…"
                emptyText={
                  materialsLoading ? "Loading…" : "No items in stock. Add stock in Inventory first."
                }
              />
            )}
          </Field>
        </FormRow>

        {!isEdit && available != null ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {fmtQty(available)} {unit}
            </span>{" "}
            available in stock.
          </p>
        ) : null}

        <FormRow columns={3}>
          <Field label="Quantity" htmlFor="sale-qty" required>
            <Input
              id="sale-qty"
              type="number"
              min="0"
              max={!isEdit && available != null ? available : undefined}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isEdit}
              placeholder="e.g. 50"
              aria-invalid={overStock}
            />
          </Field>
          <Field label="Unit" htmlFor="sale-unit">
            <Input
              id="sale-unit"
              value={unit ?? ""}
              disabled
              placeholder={isEdit ? "" : "Pick an item"}
            />
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
            {!isEdit && selectedMaterial?.unitCost != null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Last cost ₹{selectedMaterial.unitCost}/{selectedMaterial.unit}
              </p>
            ) : null}
          </Field>
        </FormRow>

        {overStock ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            Quantity exceeds available stock ({fmtQty(available ?? 0)} {unit}).
          </div>
        ) : null}

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
