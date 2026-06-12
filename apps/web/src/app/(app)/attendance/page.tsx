"use client";

import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { WorkerFormModal } from "@/components/attendance/worker-form-modal";
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
import { type Worker, useDeleteWorker, useWorkers } from "@/lib/hooks/use-attendance";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type Tab = "daysheet" | "workers";

const TABS: { id: Tab; label: string }[] = [
  { id: "daysheet", label: "Daysheet" },
  { id: "workers", label: "Workers" },
];

export default function AttendancePage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("daysheet");

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Mark daily attendance and manage your workers. Salary &amp; advances are in the Salary
          module.
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
          <Button onClick={openCreate} className="shrink-0">
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
                <TableHead className="w-full">Worker</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead className="text-right">Daily wage</TableHead>
                <TableHead className="text-right">OT rate</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-muted-foreground">{w.category ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {w.phone ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    ₹{w.dailyWage}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
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
