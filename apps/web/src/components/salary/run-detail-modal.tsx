"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type PaymentStatus,
  type SalaryRunItem,
  useDeleteRun,
  useSalaryRun,
} from "@/lib/hooks/use-salary";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { PayItemModal } from "./pay-item-modal";

interface RunDetailModalProps {
  runId: string | null;
  onClose: () => void;
}

const STATUS_VARIANT: Record<PaymentStatus, BadgeProps["variant"]> = {
  paid: "success",
  partial: "warning",
  unpaid: "outline",
};

export function RunDetailModal({ runId, onClose }: RunDetailModalProps) {
  const { can } = useAuth();
  const { data: run, isLoading } = useSalaryRun(runId);
  const deleteRun = useDeleteRun();
  const [payItem, setPayItem] = useState<SalaryRunItem | null>(null);

  const canPay = can("salary", "update");
  const canDelete = can("salary", "delete");

  const onDelete = async () => {
    if (!run) return;
    if (!window.confirm("Discard this salary run? Its advances return to the unsettled pool.")) {
      return;
    }
    try {
      await deleteRun.mutateAsync(run.id);
      onClose();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not discard the run.");
    }
  };

  return (
    <Modal
      open={!!runId}
      onClose={onClose}
      title="Salary run"
      description={run ? `${run.periodStart} → ${run.periodEnd}` : undefined}
      footer={
        canDelete && run ? (
          <Button
            variant="outline"
            className="text-danger hover:text-danger"
            onClick={onDelete}
            disabled={deleteRun.isPending}
          >
            <Trash2 className="size-4" />
            Discard run
          </Button>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {isLoading || !run ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Workers", value: run.totalWorkers },
              { label: "Gross", value: `₹${run.totalGross}` },
              { label: "Advances", value: `₹${run.totalAdvances}` },
              { label: "Net payable", value: `₹${run.totalNet}` },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-semibold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  {canPay ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.workerName}</TableCell>
                    <TableCell className="text-right tabular-nums">{it.payableDays}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {it.overtimeHours ? `${it.overtimeHours}h` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">₹{it.netPayable}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[it.paymentStatus]}>{it.paymentStatus}</Badge>
                    </TableCell>
                    {canPay ? (
                      <TableCell className="text-right">
                        {it.paymentStatus !== "paid" ? (
                          <Button variant="ghost" size="sm" onClick={() => setPayItem(it)}>
                            Pay
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {it.paymentMode ?? "—"}
                          </span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <PayItemModal
        open={!!payItem}
        onClose={() => setPayItem(null)}
        runId={run?.id ?? ""}
        item={payItem}
      />
    </Modal>
  );
}
