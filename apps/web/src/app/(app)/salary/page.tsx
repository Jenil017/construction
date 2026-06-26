"use client";

import { WorkerSalaryModal } from "@/components/salary/worker-salary-modal";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTiles, formatINR } from "@/components/ui/detail";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type PaymentStatus, useSalaryMonth } from "@/lib/hooks/use-salary";
import { ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

const STATUS_VARIANT: Record<PaymentStatus, BadgeProps["variant"]> = {
  unpaid: "danger",
  partial: "warning",
  paid: "success",
};
const STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Cleared",
};

/** Status badge, or a neutral dash when the worker has no work and no money moved. */
function PayStatus({
  gross,
  paid,
  status,
}: {
  gross: number;
  paid: number;
  status: PaymentStatus;
}) {
  if (gross === 0 && paid === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function SalaryPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading, isError, refetch } = useSalaryMonth(month);
  const [detailWorkerId, setDetailWorkerId] = useState<string | null>(null);

  const rows = data?.workers ?? [];
  const detailRow = rows.find((w) => w.workerId === detailWorkerId) ?? null;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Salary</h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.totals.workers} worker${data.totals.workers === 1 ? "" : "s"} · pay for the month, from attendance.`
              : "Each worker's pay for the month — from attendance."}
          </p>
        </div>
        <Input
          type="month"
          value={month}
          max={currentMonth()}
          onChange={(e) => setMonth(e.target.value)}
          className="w-40 sm:w-auto"
          aria-label="Month"
        />
      </div>

      {data ? (
        <StatTiles
          items={[
            { label: "Total payable", value: formatINR(data.totals.gross) },
            { label: "Paid", value: formatINR(data.totals.paid), tone: "success" },
            {
              label: "Remaining",
              value: formatINR(data.totals.balance),
              tone: data.totals.balance > 0 ? "danger" : "default",
            },
          ]}
        />
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load salary.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No workers. Add workers in the Attendance module.
          </div>
        ) : (
          <>
            {/* Mobile cards — name, days worked, status. Tap to open the worker's pay. */}
            <ul className="divide-y md:hidden">
              {rows.map((w) => (
                <li key={w.workerId}>
                  <button
                    type="button"
                    onClick={() => setDetailWorkerId(w.workerId)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{w.workerName}</span>
                        <PayStatus gross={w.gross} paid={w.paid} status={w.paymentStatus} />
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {w.payableDays} day{w.payableDays === 1 ? "" : "s"} worked
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop table — Total payable / Paid / Remaining per worker. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-full">Worker</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Total payable</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((w) => (
                    <TableRow
                      key={w.workerId}
                      className="cursor-pointer"
                      onClick={() => setDetailWorkerId(w.workerId)}
                    >
                      <TableCell className="font-medium">
                        {w.workerName}
                        {w.category ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {w.category}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{w.payableDays}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(w.gross)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {formatINR(w.paid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={w.balance > 0 ? "text-danger" : undefined}>
                          {formatINR(w.balance)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <PayStatus gross={w.gross} paid={w.paid} status={w.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailWorkerId(w.workerId);
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
          </>
        )}
      </div>

      <WorkerSalaryModal row={detailRow} month={month} onClose={() => setDetailWorkerId(null)} />
    </div>
  );
}
