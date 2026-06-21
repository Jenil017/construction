"use client";

import { InvoiceDetailModal } from "@/components/invoices/invoice-detail-modal";
import { InvoiceFormModal } from "@/components/invoices/invoice-form-modal";
import { InvoicePaymentModal } from "@/components/invoices/invoice-payment-modal";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/components/ui/detail";
import { FilterDrawer, type FilterValues } from "@/components/ui/filter-drawer";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type Invoice,
  type InvoicePaymentStatus,
  type InvoiceType,
  useInvoices,
} from "@/lib/hooks/use-invoices";
import { useOpenOnParam } from "@/lib/hooks/use-open-on-param";
import { ChevronRight, FileText, Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";

const PAYMENT_VARIANT: Record<InvoicePaymentStatus, BadgeProps["variant"]> = {
  unpaid: "danger",
  partial: "warning",
  paid: "success",
};

export default function InvoicesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});

  const {
    data: invoices,
    isLoading,
    isError,
    refetch,
  } = useInvoices({
    search: search || undefined,
    invoiceType: (filters.invoiceType as InvoiceType) || undefined,
    paymentStatus: (filters.paymentStatus as InvoicePaymentStatus) || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);

  const canCreate = can("invoices", "create");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useOpenOnParam("new", canCreate, openCreate);

  const openEdit = (invoice: Invoice) => {
    setDetailInvoice(null);
    setEditing(invoice);
    setFormOpen(true);
  };
  const openPayment = (invoice: Invoice) => {
    setDetailInvoice(null);
    setPaymentInvoice(invoice);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Create GST tax invoices and non-GST bills, and download them as PDF.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="size-4" />
            New invoice
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice no. or buyer"
            className="pl-8"
          />
        </div>
        <FilterDrawer
          fields={[
            {
              type: "select",
              key: "invoiceType",
              label: "Type",
              options: [
                { value: "tax", label: "GST Tax Invoice" },
                { value: "bill", label: "Bill / Cash Memo" },
              ],
            },
            {
              type: "select",
              key: "paymentStatus",
              label: "Payment status",
              options: [
                { value: "unpaid", label: "Unpaid" },
                { value: "partial", label: "Partially paid" },
                { value: "paid", label: "Paid" },
              ],
            },
            { type: "date", key: "dateFrom", label: "From date" },
            { type: "date", key: "dateTo", label: "To date" },
          ]}
          values={filters}
          onChange={setFilters}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load invoices.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <FileText className="size-8 opacity-40" />
            <p>No invoices yet.</p>
            {canCreate ? (
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="size-4" />
                Create your first invoice
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Mobile cards. */}
            <ul className="divide-y md:hidden">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => setDetailInvoice(inv)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{inv.invoiceNumber}</span>
                        <Badge variant={PAYMENT_VARIANT[inv.paymentStatus]}>
                          {inv.paymentStatus}
                        </Badge>
                        {inv.status === "cancelled" ? (
                          <Badge variant="danger">cancelled</Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {inv.buyerName} · {formatINR(inv.grandTotal)} · {inv.invoiceDate}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {inv.invoiceType === "tax" ? "GST Tax Invoice" : "Bill / Cash Memo"}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop table. */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Invoice No.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-full">Buyer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer"
                        onClick={() => setDetailInvoice(inv)}
                      >
                        <TableCell className="whitespace-nowrap font-medium">
                          {inv.invoiceNumber}
                          {inv.status === "cancelled" ? (
                            <Badge variant="danger" className="ml-2">
                              cancelled
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {inv.invoiceDate}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate">{inv.buyerName}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={inv.invoiceType === "tax" ? "brand" : "outline"}>
                            {inv.invoiceType === "tax" ? "Tax" : "Bill"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(inv.grandTotal)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={PAYMENT_VARIANT[inv.paymentStatus]}>
                            {inv.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailInvoice(inv);
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </div>

      <InvoiceDetailModal
        invoice={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onEdit={openEdit}
        onRecordPayment={openPayment}
      />
      <InvoiceFormModal open={formOpen} onClose={() => setFormOpen(false)} invoice={editing} />
      <InvoicePaymentModal
        open={!!paymentInvoice}
        onClose={() => setPaymentInvoice(null)}
        invoice={paymentInvoice}
      />
    </div>
  );
}
