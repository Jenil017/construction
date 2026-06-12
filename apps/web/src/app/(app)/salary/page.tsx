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
            Each worker's pay for the month — from attendance, with advances and payments.
          </p>
        </div>
        <Input
          type="month"
          value={month}
          max={currentMonth()}
          onChange={(e) => setMonth(e.target.value)}
          className="w-auto"
          aria-label="Month"
        />
      </div>

      {data ? (
        <StatTiles
          items={[
            { label: "Gross", value: formatINR(data.totals.gross) },
            { label: "Advances", value: formatINR(data.totals.advances), tone: "danger" },
            { label: "Net payable", value: formatINR(data.totals.netPayable) },
            { label: "Paid", value: formatINR(data.totals.paid), tone: "success" },
            {
              label: "Balance due",
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
            {/* Mobile cards — tap to open the worker's pay. */}
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
                        <Badge variant={STATUS_VARIANT[w.paymentStatus]}>{w.paymentStatus}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {w.payableDays} days · net {formatINR(w.netPayable)} · bal{" "}
                        {formatINR(w.balance)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop table — click a row to open the worker's pay. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-full">Worker</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Advances</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
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
                      <TableCell className="font-medium">{w.workerName}</TableCell>
                      <TableCell className="text-muted-foreground">{w.category ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.payableDays}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(w.gross)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatINR(w.advances)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatINR(w.netPayable)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {formatINR(w.paid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={w.balance > 0 ? "text-danger" : undefined}>
                          {formatINR(w.balance)}
                        </span>
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
