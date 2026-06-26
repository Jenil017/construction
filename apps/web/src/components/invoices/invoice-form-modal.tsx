"use client";

import { Button } from "@/components/ui/button";
import { formatINR } from "@/components/ui/detail";
import { Field, FormRow, FormSection } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type CreateInvoiceInput,
  type Invoice,
  type InvoiceFormInput,
  type InvoiceItemInput,
  type InvoiceType,
  computeInvoiceTotals,
  useCreateInvoice,
  useUpdateInvoice,
} from "@/lib/hooks/use-invoices";
import { type PurchaseDetail, usePurchases } from "@/lib/hooks/use-purchases";
import { type SiteSale, useSales } from "@/lib/hooks/use-selling";
import { cn } from "@/lib/utils";
import { FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** GST state/UT codes (used to auto-decide intra- vs inter-state tax). */
const GST_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];
const stateName = (code: string) => GST_STATES.find((s) => s.code === code)?.name ?? "";

const GST_RATES = ["0", "5", "12", "18", "28"];
const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];
const DEFAULT_SELLER_STATE = "24"; // Gujarat

const today = () => new Date().toISOString().slice(0, 10);

interface LineDraft {
  id: string;
  description: string;
  hsnCode: string;
  quantity: string;
  unit: string;
  rate: string;
  gstRate: string;
}

function emptyLine(): LineDraft {
  return {
    id: crypto.randomUUID(),
    description: "",
    hsnCode: "",
    quantity: "1",
    unit: "",
    rate: "",
    gstRate: "18",
  };
}

function toNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

type PrefillSource = "" | "sale" | "purchase";

/** Picks a recent (non-cancelled) sale to seed an invoice's buyer + line. */
function SalePicker({ onPick }: { onPick: (sale: SiteSale) => void }) {
  const { data, isLoading } = useSales({});
  const sales = (data ?? []).filter((s) => s.status !== "cancelled");
  return (
    <Select
      id="inv-prefill-rec"
      aria-label="Select a sale"
      defaultValue=""
      onChange={(e) => {
        const s = sales.find((x) => x.id === e.target.value);
        if (s) onPick(s);
      }}
    >
      <option value="" disabled>
        {isLoading ? "Loading sales…" : sales.length ? "Select a sale…" : "No sales yet"}
      </option>
      {sales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.saleDate} · {s.itemDescription} · {s.buyerName ?? "—"} · {formatINR(s.totalAmount)}
        </option>
      ))}
    </Select>
  );
}

/** Picks a recent (non-cancelled) purchase to seed an invoice's line items. */
function PurchasePicker({ onPick }: { onPick: (id: string) => void }) {
  const { data, isLoading } = usePurchases({});
  const purchases = (data ?? []).filter((p) => p.status !== "cancelled");
  return (
    <Select
      id="inv-prefill-rec"
      aria-label="Select a purchase"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
    >
      <option value="" disabled>
        {isLoading
          ? "Loading purchases…"
          : purchases.length
            ? "Select a purchase…"
            : "No purchases yet"}
      </option>
      {purchases.map((p) => (
        <option key={p.id} value={p.id}>
          {p.orderDate} · {p.sellerName ?? p.poNumber ?? "Purchase"} · {formatINR(p.total)}
        </option>
      ))}
    </Select>
  );
}

interface InvoiceFormModalProps {
  open: boolean;
  onClose: () => void;
  invoice?: Invoice | null;
}

export function InvoiceFormModal({ open, onClose, invoice }: InvoiceFormModalProps) {
  const isEdit = !!invoice;
  const { activeSite, can } = useAuth();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const canPrefillSale = can("selling", "view");
  const canPrefillPurchase = can("purchases", "view");

  const [invoiceType, setInvoiceType] = useState<InvoiceType>("tax");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [buyerStateCode, setBuyerStateCode] = useState(DEFAULT_SELLER_STATE);
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerGstin, setSellerGstin] = useState("");
  const [sellerStateCode, setSellerStateCode] = useState(DEFAULT_SELLER_STATE);
  const [sellerAddress, setSellerAddress] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [notes, setNotes] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [prefillSource, setPrefillSource] = useState<PrefillSource>("");
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPrefillSource("");
    setPrefillNote(null);
    setInvoiceType(invoice?.invoiceType ?? "tax");
    setInvoiceDate(invoice?.invoiceDate ?? today());
    setDueDate(invoice?.dueDate ?? "");
    setBuyerName(invoice?.buyerName ?? "");
    setBuyerGstin(invoice?.buyerGstin ?? "");
    setBuyerStateCode(invoice?.buyerStateCode ?? DEFAULT_SELLER_STATE);
    setBuyerAddress(invoice?.buyerAddress ?? "");
    setBuyerContact(invoice?.buyerContact ?? "");
    setSellerName(invoice?.sellerName ?? activeSite?.name ?? "");
    setSellerGstin(invoice?.sellerGstin ?? "");
    setSellerStateCode(invoice?.sellerStateCode ?? DEFAULT_SELLER_STATE);
    setSellerAddress(invoice?.sellerAddress ?? "");
    setReverseCharge(invoice?.reverseCharge ?? false);
    setNotes(invoice?.notes ?? "");
    setAmountReceived("");
    setPaymentMode(invoice?.paymentMode ?? "Cash");
    setLines(
      invoice?.items.length
        ? invoice.items.map((it) => ({
            id: crypto.randomUUID(),
            description: it.description,
            hsnCode: it.hsnCode ?? "",
            quantity: String(it.quantity),
            unit: it.unit ?? "",
            rate: String(it.rate),
            gstRate: String(it.gstRate),
          }))
        : [emptyLine()],
    );
  }, [open, invoice, activeSite]);

  const isTax = invoiceType === "tax";
  const supplyType =
    isTax && sellerStateCode && buyerStateCode && sellerStateCode !== buyerStateCode
      ? "inter"
      : "intra";

  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        lines.map((l) => ({
          quantity: toNum(l.quantity),
          rate: toNum(l.rate),
          discountAmount: 0,
          gstRate: toNum(l.gstRate),
        })),
        { invoiceType, supplyType },
      ),
    [lines, invoiceType, supplyType],
  );

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  // ── Prefill from a past sale (buyer + the sold item) or purchase (line items only) ──
  const applySale = (sale: SiteSale) => {
    setError(null);
    if (sale.buyerName) setBuyerName(sale.buyerName);
    if (sale.buyerContact) setBuyerContact(sale.buyerContact);
    setInvoiceDate(sale.saleDate);
    if (sale.paymentMode) setPaymentMode(sale.paymentMode);
    setAmountReceived(sale.amountReceived > 0 ? String(sale.amountReceived) : "");
    if (sale.notes) setNotes(sale.notes);
    setLines([
      {
        id: crypto.randomUUID(),
        description: sale.itemDescription,
        hsnCode: "",
        quantity: String(sale.quantity),
        unit: sale.unit,
        rate: String(sale.ratePerUnit),
        gstRate: "18",
      },
    ]);
    setPrefillNote(`Prefilled from the sale dated ${sale.saleDate}. Review and edit below.`);
  };

  const applyPurchase = async (id: string) => {
    setError(null);
    setPrefillNote(null);
    try {
      const detail = await apiFetch<PurchaseDetail>(`/purchases/${id}`);
      const items = detail.items.filter((it) => it.description.trim().length > 0);
      if (items.length === 0) {
        setError("That purchase has no line items to prefill.");
        return;
      }
      setLines(
        items.map((it) => ({
          id: crypto.randomUUID(),
          description: it.description,
          hsnCode: "",
          quantity: String(it.quantity),
          unit: it.unit ?? "",
          rate: String(it.rate),
          gstRate: "18",
        })),
      );
      setPrefillNote(
        `Prefilled ${items.length} line item${items.length === 1 ? "" : "s"} from the purchase. Enter the customer to bill.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load that purchase.");
    }
  };

  const submit = async () => {
    setError(null);
    if (!buyerName.trim()) {
      setError("Enter the buyer's name.");
      return;
    }
    const items: InvoiceItemInput[] = [];
    for (const l of lines) {
      if (!l.description.trim()) continue;
      const quantity = toNum(l.quantity);
      const rate = toNum(l.rate);
      if (quantity <= 0) {
        setError(`Enter a quantity for "${l.description.trim()}".`);
        return;
      }
      items.push({
        description: l.description.trim(),
        hsnCode: l.hsnCode.trim() || null,
        quantity,
        unit: l.unit.trim() || null,
        rate,
        gstRate: isTax ? toNum(l.gstRate) : 0,
      });
    }
    if (items.length === 0) {
      setError("Add at least one line item with a description.");
      return;
    }

    const base: InvoiceFormInput = {
      invoiceDate,
      dueDate: dueDate || null,
      reverseCharge: isTax ? reverseCharge : false,
      sellerName: sellerName.trim() || null,
      sellerGstin: sellerGstin.trim().toUpperCase() || null,
      sellerStateCode: sellerStateCode || null,
      sellerState: stateName(sellerStateCode) || null,
      sellerAddress: sellerAddress.trim() || null,
      buyerName: buyerName.trim(),
      buyerGstin: buyerGstin.trim().toUpperCase() || null,
      buyerStateCode: buyerStateCode || null,
      buyerState: stateName(buyerStateCode) || null,
      buyerAddress: buyerAddress.trim() || null,
      buyerContact: buyerContact.trim() || null,
      notes: notes.trim() || null,
      items,
    };

    try {
      if (isEdit && invoice) {
        await updateInvoice.mutateAsync({ id: invoice.id, body: base });
      } else {
        const received = toNum(amountReceived);
        const body: CreateInvoiceInput = {
          invoiceType,
          ...base,
          paymentMode,
          ...(received > 0 ? { amountReceived: received } : {}),
        };
        await createInvoice.mutateAsync(body);
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the invoice.");
    }
  };

  const busy = createInvoice.isPending || updateInvoice.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={FileText}
      size="lg"
      title={isEdit ? `Edit ${invoice?.invoiceNumber}` : "New invoice"}
      description={
        isEdit
          ? "Update invoice details and line items."
          : "Create a GST tax invoice or a non-GST bill / cash memo."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create invoice"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Type toggle (fixed once created). */}
        <div className="flex gap-2">
          {(["tax", "bill"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={isEdit}
              onClick={() => setInvoiceType(t)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
                invoiceType === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {t === "tax" ? "GST Tax Invoice" : "Bill / Cash Memo"}
            </button>
          ))}
        </div>

        {/* Prefill from a past sale/purchase (create only). */}
        {!isEdit && (canPrefillSale || canPrefillPurchase) ? (
          <FormSection
            title="Prefill from a past transaction"
            description="Start from a recent sale (fills buyer + item) or a purchase (fills line items only)."
          >
            <FormRow columns={2}>
              <Field label="Source" htmlFor="inv-prefill-src">
                <Select
                  id="inv-prefill-src"
                  value={prefillSource}
                  onChange={(e) => {
                    setPrefillSource(e.target.value as PrefillSource);
                    setPrefillNote(null);
                  }}
                >
                  <option value="">None</option>
                  {canPrefillSale ? <option value="sale">A sale</option> : null}
                  {canPrefillPurchase ? <option value="purchase">A purchase</option> : null}
                </Select>
              </Field>
              {prefillSource === "sale" ? (
                <Field label="Pick a sale" htmlFor="inv-prefill-rec">
                  <SalePicker onPick={applySale} />
                </Field>
              ) : prefillSource === "purchase" ? (
                <Field label="Pick a purchase" htmlFor="inv-prefill-rec">
                  <PurchasePicker onPick={applyPurchase} />
                </Field>
              ) : null}
            </FormRow>
            {prefillNote ? (
              <p className="rounded-md bg-success/10 px-3 py-2 text-xs text-success">
                {prefillNote}
              </p>
            ) : null}
          </FormSection>
        ) : null}

        <FormRow columns={2}>
          <Field label="Invoice date" htmlFor="inv-date">
            <Input
              id="inv-date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </Field>
          <Field label="Due date" htmlFor="inv-due">
            <Input
              id="inv-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </FormRow>

        <FormSection title="Bill to (buyer)">
          <FormRow columns={2}>
            <Field label="Buyer name" htmlFor="inv-buyer" required>
              <Input
                id="inv-buyer"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Customer / company name"
              />
            </Field>
            <Field label="Buyer state" htmlFor="inv-buyer-state">
              <Select
                id="inv-buyer-state"
                value={buyerStateCode}
                onChange={(e) => setBuyerStateCode(e.target.value)}
              >
                {GST_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormRow>
          <FormRow columns={2}>
            {isTax ? (
              <Field label="Buyer GSTIN" htmlFor="inv-buyer-gstin" hint="15 characters (optional)">
                <Input
                  id="inv-buyer-gstin"
                  value={buyerGstin}
                  onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 24ABCDE1234F1Z5"
                  maxLength={15}
                />
              </Field>
            ) : null}
            <Field label="Buyer contact" htmlFor="inv-buyer-contact">
              <Input
                id="inv-buyer-contact"
                value={buyerContact}
                onChange={(e) => setBuyerContact(e.target.value)}
                placeholder="Phone (optional)"
              />
            </Field>
          </FormRow>
          <Field label="Buyer address" htmlFor="inv-buyer-addr">
            <Input
              id="inv-buyer-addr"
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
              placeholder="Address (optional)"
            />
          </Field>
        </FormSection>

        {/* Line items */}
        <FormSection title="Items">
          <div className="space-y-3">
            {lines.map((l, i) => {
              const lineTotals = computeInvoiceTotals(
                [
                  {
                    quantity: toNum(l.quantity),
                    rate: toNum(l.rate),
                    discountAmount: 0,
                    gstRate: toNum(l.gstRate),
                  },
                ],
                { invoiceType, supplyType },
              );
              return (
                <div
                  key={l.id}
                  className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3"
                >
                  <div className="flex items-start gap-2">
                    <Input
                      aria-label="Description"
                      value={l.description}
                      onChange={(e) => setLine(i, { description: e.target.value })}
                      placeholder="Item / service description"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                      aria-label="Remove line"
                      className="mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div
                    className={cn(
                      "grid gap-2",
                      isTax
                        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
                        : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
                    )}
                  >
                    <Input
                      aria-label="HSN/SAC"
                      value={l.hsnCode}
                      onChange={(e) => setLine(i, { hsnCode: e.target.value })}
                      placeholder="HSN/SAC"
                    />
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min="0"
                      step="any"
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                      placeholder="Qty"
                    />
                    <Input
                      aria-label="Unit"
                      value={l.unit}
                      onChange={(e) => setLine(i, { unit: e.target.value })}
                      placeholder="Unit"
                    />
                    <Input
                      aria-label="Rate"
                      type="number"
                      min="0"
                      step="any"
                      value={l.rate}
                      onChange={(e) => setLine(i, { rate: e.target.value })}
                      placeholder="Rate ₹"
                    />
                    {isTax ? (
                      <Select
                        aria-label="GST rate"
                        value={l.gstRate}
                        onChange={(e) => setLine(i, { gstRate: e.target.value })}
                      >
                        {GST_RATES.map((r) => (
                          <option key={r} value={r}>
                            {r}% GST
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <div className="flex items-center justify-end rounded-md bg-card px-2 text-sm font-medium tabular-nums">
                      {formatINR(lineTotals.grandTotal)}
                    </div>
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={addLine} type="button">
              <Plus className="size-4" />
              Add line
            </Button>
          </div>
        </FormSection>

        {/* Totals preview */}
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">Sub total</span>
            <span className="tabular-nums">{formatINR(totals.subTotal)}</span>
          </div>
          {isTax && supplyType === "intra" && totals.taxTotal > 0 ? (
            <>
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">CGST</span>
                <span className="tabular-nums">{formatINR(totals.cgstTotal)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">SGST</span>
                <span className="tabular-nums">{formatINR(totals.sgstTotal)}</span>
              </div>
            </>
          ) : null}
          {isTax && supplyType === "inter" && totals.taxTotal > 0 ? (
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">IGST</span>
              <span className="tabular-nums">{formatINR(totals.igstTotal)}</span>
            </div>
          ) : null}
          {totals.roundOff !== 0 ? (
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Round off</span>
              <span className="tabular-nums">{formatINR(totals.roundOff)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold">
            <span>{isTax ? "Grand total" : "Total"}</span>
            <span className="tabular-nums">{formatINR(totals.grandTotal)}</span>
          </div>
          {isTax ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {supplyType === "inter"
                ? "Inter-state supply — IGST applies."
                : "Intra-state supply — CGST + SGST apply."}
            </p>
          ) : null}
        </div>

        {/* Seller (your business) */}
        <FormSection
          title="Your business (seller)"
          description="Defaults from the site. Set once here and it carries onto the invoice."
        >
          <FormRow columns={2}>
            <Field label="Business name" htmlFor="inv-seller">
              <Input
                id="inv-seller"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder="Your business / firm name"
              />
            </Field>
            <Field label="Seller state" htmlFor="inv-seller-state">
              <Select
                id="inv-seller-state"
                value={sellerStateCode}
                onChange={(e) => setSellerStateCode(e.target.value)}
              >
                {GST_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormRow>
          {isTax ? (
            <Field label="Your GSTIN" htmlFor="inv-seller-gstin">
              <Input
                id="inv-seller-gstin"
                value={sellerGstin}
                onChange={(e) => setSellerGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 24ABCDE1234F1Z5"
                maxLength={15}
              />
            </Field>
          ) : null}
          <Field label="Business address" htmlFor="inv-seller-addr">
            <Input
              id="inv-seller-addr"
              value={sellerAddress}
              onChange={(e) => setSellerAddress(e.target.value)}
              placeholder="Address (optional)"
            />
          </Field>
        </FormSection>

        {isTax ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reverseCharge}
              onChange={(e) => setReverseCharge(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Tax payable under reverse charge
          </label>
        ) : null}

        {!isEdit ? (
          <FormRow columns={2}>
            <Field label="Payment mode" htmlFor="inv-mode">
              <Select
                id="inv-mode"
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
            <Field label="Amount received (₹)" htmlFor="inv-received">
              <Input
                id="inv-received"
                type="number"
                min="0"
                step="any"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="0 — if already received"
              />
            </Field>
          </FormRow>
        ) : null}

        <Field label="Notes" htmlFor="inv-notes">
          <Input
            id="inv-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Terms, bank details, etc. (optional)"
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
