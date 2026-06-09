"use client";

import { AdvanceFormModal } from "@/components/attendance/advance-form-modal";
import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { WorkerFormModal } from "@/components/attendance/worker-form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  type Worker,
  useAdvances,
  useDeleteAdvance,
  useDeleteWorker,
  useWorkers,
} from "@/lib/hooks/use-attendance";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type Tab = "daysheet" | "workers" | "advances";

const TABS: { id: Tab; label: string }[] = [
  { id: "daysheet", label: "Daysheet" },
  { id: "workers", label: "Workers" },
  { id: "advances", label: "Advances" },
];

export default function AttendancePage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("daysheet");

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Mark daily attendance, manage workers, and track advances for this site.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "daysheet" ? <AttendanceSheet /> : null}
      {tab === "workers" ? <WorkersTab canManage={can} /> : null}
      {tab === "advances" ? <AdvancesTab canManage={can} /> : null}
    </div>
  );
}

type CanFn = (m: "attendance", a: "create" | "update" | "delete") => boolean;

function WorkersTab({ canManage }: { canManage: CanFn }) {
  const { data: workers, isLoading, isError, refetch } = useWorkers();
  const deleteWorker = useDeleteWorker();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);

  const canCreate = canManage("attendance", "create");
  const canUpdate = canManage("attendance", "update");
  const canDelete = canManage("attendance", "delete");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (w: Worker) => {
    setEditing(w);
    setFormOpen(true);
  };
  const onDelete = async (w: Worker) => {
    if (!window.confirm(`Retire "${w.name}"? Past attendance and salary are kept.`)) return;
    try {
      await deleteWorker.mutateAsync(w.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not remove the worker.");
    }
  };

  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Add worker
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load workers.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !workers || workers.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No workers yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead className="text-right">Daily wage</TableHead>
                <TableHead className="text-right">OT rate</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">
                    {w.name}
                    {w.phone ? (
                      <span className="block text-xs text-muted-foreground">{w.phone}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{w.trade ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{w.dailyWage}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {w.overtimeRate != null ? `₹${w.overtimeRate}/hr` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canUpdate ? (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>
                          Edit
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:text-danger"
                          onClick={() => onDelete(w)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <WorkerFormModal open={formOpen} onClose={() => setFormOpen(false)} worker={editing} />
    </div>
  );
}

function AdvancesTab({ canManage }: { canManage: CanFn }) {
  const { data: advances, isLoading, isError, refetch } = useAdvances();
  const { data: workers } = useWorkers();
  const deleteAdvance = useDeleteAdvance();
  const [formOpen, setFormOpen] = useState(false);

  const canCreate = canManage("attendance", "create");
  const canDelete = canManage("attendance", "delete");

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this advance?")) return;
    try {
      await deleteAdvance.mutateAsync(id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not delete the advance.");
    }
  };

  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Record advance
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load advances.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !advances || advances.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No advances recorded.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {advances.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.workerName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.advanceDate}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{a.amount}</TableCell>
                  <TableCell>
                    {a.settled ? (
                      <Badge variant="default">Settled</Badge>
                    ) : (
                      <Badge variant="teal">Outstanding</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canDelete && !a.settled ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger"
                        onClick={() => onDelete(a.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AdvanceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        workers={workers ?? []}
      />
    </div>
  );
}
