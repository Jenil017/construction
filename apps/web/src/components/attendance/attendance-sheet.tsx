"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  type AttendanceStatus,
  useApproveAttendance,
  useAttendance,
  useMarkAttendance,
  useWorkers,
} from "@/lib/hooks/use-attendance";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; cls: string }[] = [
  { value: "present", label: "P", cls: "bg-success text-white" },
  { value: "half_day", label: "½", cls: "bg-warning text-white" },
  { value: "absent", label: "A", cls: "bg-danger text-white" },
];

interface DraftEntry {
  status: AttendanceStatus | "";
  ot: string;
}

export function AttendanceSheet() {
  const { can } = useAuth();
  const canCreate = can("attendance", "create");
  const canApprove = can("attendance", "approve");

  const [date, setDate] = useState(today());
  const { data: workers, isLoading: workersLoading } = useWorkers();
  const { data: records, isLoading: recordsLoading } = useAttendance({ date });
  const mark = useMarkAttendance();
  const approve = useApproveAttendance();

  const [draft, setDraft] = useState<Record<string, DraftEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const recordByWorker = useMemo(
    () => new Map((records ?? []).map((r) => [r.workerId, r])),
    [records],
  );

  // Seed the editable draft from any existing records for the date.
  useEffect(() => {
    const next: Record<string, DraftEntry> = {};
    for (const w of workers ?? []) {
      const rec = recordByWorker.get(w.id);
      next[w.id] = {
        status: rec?.status ?? "",
        ot: rec?.overtimeHours ? String(rec.overtimeHours) : "",
      };
    }
    setDraft(next);
    setSavedMsg(null);
    setError(null);
  }, [workers, recordByWorker]);

  const setStatus = (workerId: string, status: AttendanceStatus) => {
    if (recordByWorker.get(workerId)?.approved) return; // locked
    setSavedMsg(null);
    setDraft((d) => {
      const prev = d[workerId] ?? { status: "", ot: "" };
      return { ...d, [workerId]: { ...prev, status } };
    });
  };
  const setOt = (workerId: string, ot: string) => {
    if (recordByWorker.get(workerId)?.approved) return;
    setDraft((d) => {
      const prev = d[workerId] ?? { status: "", ot: "" };
      return { ...d, [workerId]: { ...prev, ot } };
    });
  };
  const markAllPresent = () => {
    setSavedMsg(null);
    setDraft((d) => {
      const next = { ...d };
      for (const w of workers ?? []) {
        if (recordByWorker.get(w.id)?.approved) continue;
        next[w.id] = { ...(next[w.id] ?? { status: "", ot: "" }), status: "present" };
      }
      return next;
    });
  };

  const counts = useMemo(() => {
    let present = 0;
    let half = 0;
    let absent = 0;
    let unmarked = 0;
    for (const w of workers ?? []) {
      const s = draft[w.id]?.status;
      if (s === "present") present += 1;
      else if (s === "half_day") half += 1;
      else if (s === "absent") absent += 1;
      else unmarked += 1;
    }
    return { present, half, absent, unmarked };
  }, [workers, draft]);

  const unapprovedMarked = useMemo(
    () => (records ?? []).filter((r) => !r.approved).length,
    [records],
  );

  const save = async () => {
    setError(null);
    setSavedMsg(null);
    const entries: { workerId: string; status: AttendanceStatus; overtimeHours: number }[] = [];
    for (const w of workers ?? []) {
      const entry = draft[w.id];
      if (!entry || !entry.status) continue;
      if (recordByWorker.get(w.id)?.approved) continue;
      entries.push({ workerId: w.id, status: entry.status, overtimeHours: Number(entry.ot) || 0 });
    }
    if (entries.length === 0) {
      setError("Mark at least one worker before saving.");
      return;
    }
    try {
      const res = await mark.mutateAsync({ date, entries });
      setSavedMsg(
        `Saved ${res.saved.length} record${res.saved.length === 1 ? "" : "s"}.${
          res.skippedApproved ? ` ${res.skippedApproved} already-approved skipped.` : ""
        }`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save attendance.");
    }
  };

  const approveDay = async () => {
    if (!window.confirm(`Approve all marked attendance for ${date}? Approved records lock.`))
      return;
    setError(null);
    try {
      const res = await approve.mutateAsync({ date });
      setSavedMsg(`Approved ${res.approved} record${res.approved === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not approve attendance.");
    }
  };

  const loading = workersLoading || recordsLoading;
  const busy = mark.isPending || approve.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <label htmlFor="att-date" className="text-sm font-medium">
            Date
          </label>
          <Input
            id="att-date"
            type="date"
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="sm:w-48"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="success">Present {counts.present}</Badge>
          <Badge variant="warning">Half {counts.half}</Badge>
          <Badge variant="danger">Absent {counts.absent}</Badge>
          <Badge variant="outline">Unmarked {counts.unmarked}</Badge>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !workers || workers.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
          No workers yet. Add workers first to mark attendance.
        </div>
      ) : (
        <>
          {canCreate ? (
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={markAllPresent} disabled={busy}>
                Mark all present
              </Button>
            </div>
          ) : null}

          <ul className="divide-y rounded-xl border bg-card">
            {workers.map((w) => {
              const rec = recordByWorker.get(w.id);
              const entry = draft[w.id] ?? { status: "", ot: "" };
              const locked = !!rec?.approved;
              const showOt = entry.status === "present" || entry.status === "half_day";
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{w.name}</span>
                      {locked ? (
                        <Badge variant="brand" className="gap-1">
                          <CheckCircle2 className="size-3" />
                          Approved
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {w.trade ?? "—"} · ₹{w.dailyWage}/day
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {STATUS_OPTIONS.map((opt) => {
                      const active = entry.status === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={!canCreate || locked}
                          onClick={() => setStatus(w.id, opt.value)}
                          className={`size-9 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50 ${
                            active ? opt.cls : "bg-card text-muted-foreground hover:bg-accent"
                          }`}
                          aria-label={opt.value}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {showOt ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={entry.ot}
                        disabled={!canCreate || locked}
                        onChange={(e) => setOt(w.id, e.target.value)}
                        placeholder="OT"
                        className="w-16"
                        aria-label="Overtime hours"
                      />
                      <span className="text-xs text-muted-foreground">hr</span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {error ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}
          {savedMsg ? (
            <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              {savedMsg}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            {canApprove && unapprovedMarked > 0 ? (
              <Button variant="outline" onClick={approveDay} disabled={busy}>
                Approve day ({unapprovedMarked})
              </Button>
            ) : null}
            {canCreate ? (
              <Button onClick={save} disabled={busy}>
                {mark.isPending ? "Saving…" : "Save attendance"}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
