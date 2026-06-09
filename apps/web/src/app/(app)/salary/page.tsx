"use client";

import { GenerateRunModal } from "@/components/salary/generate-run-modal";
import { RunDetailModal } from "@/components/salary/run-detail-modal";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth/auth-context";
import { useSalaryRuns } from "@/lib/hooks/use-salary";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { useState } from "react";

export default function SalaryPage() {
  const { can } = useAuth();
  const { data: runs, isLoading, isError, refetch } = useSalaryRuns();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canCreate = can("salary", "create");

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Salary</h1>
          <p className="text-sm text-muted-foreground">
            Generate payroll from approved attendance and track payments.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setGenerateOpen(true)} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Generate run
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load salary runs.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !runs || runs.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No salary runs yet. Generate one from approved attendance.
          </div>
        ) : (
          <>
            {/* Mobile: tappable cards. */}
            <ul className="divide-y md:hidden">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(r.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate font-medium">
                        {r.periodStart} → {r.periodEnd}
                      </span>
                      <p className="truncate text-sm text-muted-foreground">
                        {r.totalWorkers} workers · net ₹{r.totalNet}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop: table. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Workers</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Advances</TableHead>
                    <TableHead className="text-right">Net payable</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setDetailId(r.id)}
                    >
                      <TableCell className="font-medium">
                        {r.periodStart} → {r.periodEnd}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.totalWorkers}</TableCell>
                      <TableCell className="text-right tabular-nums">₹{r.totalGross}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        ₹{r.totalAdvances}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        ₹{r.totalNet}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailId(r.id);
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

      <GenerateRunModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={(id) => setDetailId(id)}
      />
      <RunDetailModal runId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
