"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailRows, StatTiles, formatINR } from "@/components/ui/detail";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type Invoice,
  type InvoicePaymentStatus,
  downloadInvoicePdf,
  useCancelInvoice,
  useDeleteInvoice,
} from "@/lib/hooks/use-invoices";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onEdit: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
}

const PAYMENT_VARIANT: Record<InvoicePaymentStatus, BadgeProps["variant"]> = {
  unpaid: "danger",
  partial: "warning",
  paid: "success",
};

export function InvoiceDetailModal({
  invoice,
  onClose,
  onEdit,
  onRecordPayment,
}: InvoiceDetailModalProps) {
  const { can } = useAuth();
  const cancelInvoice = useCancelInvoice();
  const deleteInvoice = useDeleteInvoice();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (!invoice) return null;

  const isTax = invoice.invoiceType === "tax";
  const isCancelled = invoice.status === "cancelled";
  const outstanding = Math.max(0, invoice.grandTotal - invoice.amountReceived);
  const canUpdate = can("invoices", "update");
  const canDelete = can("invoices", "delete");

  const onDownload = async () => {
    setError(null);
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice.id, invoice.invoiceNumber);
    } catch {
      setError("Could not download the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const onCancel = async () => {
    if (!window.confirm("Cancel this invoice? It keeps its number but is marked cancelled."))
      return;
    setError(null);
    try {
      await cancelInvoice.mutateAsync(invoice.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel the invoice.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    setError(null);
    try {
      await deleteInvoice.mutateAsync(invoice.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the invoice.");
    }
  };

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      size="lg"
      title={invoice.invoiceNumber}
      description={`${isTax ? "Tax Invoice" : "Bill of Supply"} · ${invoice.buyerName}`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={isTax ? "brand" : "outline"}>
            {isTax ? "GST Tax Invoice" : "Bill / Cash Memo"}
          </Badge>
          {isCancelled ? <Badge variant="danger">cancelled</Badge> : null}
          <Badge variant={PAYMENT_VARIANT[invoice.paymentStatus]}>{invoice.paymentStatus}</Badge>
          <span className="text-muted-foreground">Dated {invoice.invoiceDate}</span>
        </div>

        <StatTiles
          items={[
            { label: "Grand total", value: formatINR(invoice.grandTotal) },
            { label: "Received", value: formatINR(invoice.amountReceived), tone: "success" },
            {
              label: "Outstanding",
              value: formatINR(outstanding),
              tone: outstanding > 0 ? "danger" : "default",
            },
          ]}
        />

        {/* Line items */}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">Description</th>
                <th className="px-2.5 py-2 text-right font-medium">Qty</th>
                <th className="px-2.5 py-2 text-right font-medium">Rate</th>
                <th className="px-2.5 py-2 text-right font-medium">Taxable</th>
                {isTax ? <th className="px-2.5 py-2 text-right font-medium">GST</th> : null}
                <th className="px-2.5 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-2.5 py-2">
                    <div className="font-medium">{it.description}</div>
                    {it.hsnCode ? (
                      <div className="text-xs text-muted-foreground">HSN/SAC: {it.hsnCode}</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">
                    {it.quantity}
                    {it.unit ? ` ${it.unit}` : ""}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{formatINR(it.rate)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">
                    {formatINR(it.taxableValue)}
                  </td>
                  {isTax ? (
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">
                      {it.gstRate ? `${it.gstRate}%` : "—"}
                    </td>
                  ) : null}
                  <td className="px-2.5 py-2 text-right tabular-nums">{formatINR(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Sub total</dt>
            <dd className="tabular-nums">{formatINR(invoice.subTotal)}</dd>
          </div>
          {invoice.cgstTotal > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">CGST</dt>
              <dd className="tabular-nums">{formatINR(invoice.cgstTotal)}</dd>
            </div>
          ) : null}
          {invoice.sgstTotal > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">SGST</dt>
              <dd className="tabular-nums">{formatINR(invoice.sgstTotal)}</dd>
            </div>
          ) : null}
          {invoice.igstTotal > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IGST</dt>
              <dd className="tabular-nums">{formatINR(invoice.igstTotal)}</dd>
            </div>
          ) : null}
          {invoice.roundOff !== 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Round off</dt>
              <dd className="tabular-nums">{formatINR(invoice.roundOff)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-1 font-semibold">
            <dt>{isTax ? "Grand total" : "Total"}</dt>
            <dd className="tabular-nums">{formatINR(invoice.grandTotal)}</dd>
          </div>
        </dl>

        {invoice.amountInWords ? (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Amount in words: </span>
            <span className="font-medium">{invoice.amountInWords}</span>
          </p>
        ) : null}

        <DetailRows
          rows={[
            { label: "Buyer", value: invoice.buyerName },
            { label: "Buyer GSTIN", value: invoice.buyerGstin ?? "—", hideEmpty: true },
            {
              label: "Buyer state",
              value: invoice.buyerState ?? "—",
              hideEmpty: true,
            },
            { label: "Seller", value: invoice.sellerName },
            { label: "Seller GSTIN", value: invoice.sellerGstin ?? "—", hideEmpty: true },
            {
              label: "Supply type",
              value: isTax
                ? invoice.supplyType === "inter"
                  ? "Inter-state (IGST)"
                  : "Intra-state (CGST + SGST)"
                : "—",
              hideEmpty: true,
            },
            { label: "Place of supply", value: invoice.placeOfSupply ?? "—", hideEmpty: true },
            {
              label: "Reverse charge",
              value: invoice.reverseCharge ? "Yes" : "—",
              hideEmpty: true,
            },
            { label: "Due date", value: invoice.dueDate ?? "—", hideEmpty: true },
            { label: "Payment mode", value: invoice.paymentMode ?? "—", hideEmpty: true },
            { label: "Created by", value: invoice.createdBy?.name ?? "—" },
          ]}
        />

        {invoice.notes ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="mb-1 text-xs text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading}>
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download PDF
          </Button>
          {!isCancelled && canUpdate && outstanding > 0 ? (
            <Button variant="outline" size="sm" onClick={() => onRecordPayment(invoice)}>
              Record payment
            </Button>
          ) : null}
          {!isCancelled && canUpdate ? (
            <Button variant="outline" size="sm" onClick={() => onEdit(invoice)}>
              Edit
            </Button>
          ) : null}
          {!isCancelled && canUpdate ? (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={cancelInvoice.isPending}>
              {cancelInvoice.isPending ? "Cancelling…" : "Cancel invoice"}
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={onDelete}
              disabled={deleteInvoice.isPending}
            >
              {deleteInvoice.isPending ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
