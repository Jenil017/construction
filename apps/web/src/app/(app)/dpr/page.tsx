"use client";

import { DprDetailModal } from "@/components/dpr/dpr-detail-modal";
import { DprFormModal } from "@/components/dpr/dpr-form-modal";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import { type DprRow, type DprStatus, useDeleteDpr, useDprList } from "@/lib/hooks/use-dpr";
import { useOpenOnParam } from "@/lib/hooks/use-open-on-param";
import { Camera, ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

const STATUS_META: Record<DprStatus, { label: string; variant: BadgeProps["variant"] }> = {
  draft: { label: "Draft", variant: "default" },
  submitted: { label: "Submitted", variant: "brand" },
  approved: { label: "Approved", variant: "success" },
};

export default function DprPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const {
    data: reports,
    isLoading,
    isError,
    refetch,
  } = useDprList({
    search: search || undefined,
    status: (filters.status as DprStatus) || undefined,
    date: filters.date || undefined,
  });
  const deleteDpr = useDeleteDpr();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DprRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canCreate = can("dpr", "create");
  const canDelete = can("dpr", "delete");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  useOpenOnParam("new", canCreate, openCreate);
  const openEdit = (dpr: DprRow) => {
    setDetailId(null);
    setEditing(dpr);
    setFormOpen(true);
  };
  const onDelete = async (dpr: DprRow) => {
    if (!window.confirm(`Delete the report for ${dpr.reportDate}?`)) return;
    try {
      await deleteDpr.mutateAsync(dpr.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not delete the report.");
    }
  };

  const meta = (s: DprStatus) => STATUS_META[s];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Daily Progress Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Date-wise site progress with photos, quantities, and approvals.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="size-4" />
            New report
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category or location"
            className="pl-8"
          />
        </div>
        <FilterDrawer
          fields={[
            {
              type: "select",
              key: "status",
              label: "Status",
              options: [
                { value: "draft", label: "Draft" },
                { value: "submitted", label: "Submitted" },
                { value: "approved", label: "Approved" },
              ],
            },
            { type: "date", key: "date", label: "Report date" },
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
            <p>Could not load reports.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !reports || reports.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No reports found.</div>
        ) : (
          <>
            {/* Mobile: tappable cards (avoids wide-table overflow). */}
            <ul className="divide-y md:hidden">
              {reports.map((dpr) => (
                <li key={dpr.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(dpr.id)}
                    className="flex w-full items-center gap-3 px-4 pt-3 pb-2 text-left transition-colors active:bg-accent"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{dpr.reportDate}</span>
                        <Badge variant={meta(dpr.status).variant}>{meta(dpr.status).label}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {dpr.workCategory ?? "Uncategorized"}
                        {dpr.location ? ` · ${dpr.location}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  <div className="flex items-center justify-between gap-2 px-4 pb-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Camera className="size-3.5" />
                        {dpr.photoCount}
                      </span>
                      <span className="truncate">by {dpr.createdBy?.name ?? "—"}</span>
                    </span>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => onDelete(dpr)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-danger transition-colors active:bg-danger/10"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: full table. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-full">Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Photos</TableHead>
                    <TableHead>Created by</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((dpr) => (
                    <TableRow
                      key={dpr.id}
                      className="cursor-pointer"
                      onClick={() => setDetailId(dpr.id)}
                    >
                      <TableCell className="font-medium">{dpr.reportDate}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {dpr.workCategory ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{dpr.location ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={meta(dpr.status).variant}>{meta(dpr.status).label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dpr.photoCount > 0 ? dpr.photoCount : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dpr.createdBy?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailId(dpr.id);
                            }}
                          >
                            View
                          </Button>
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:text-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(dpr);
                              }}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <DprFormModal open={formOpen} onClose={() => setFormOpen(false)} dpr={editing} />
      <DprDetailModal dprId={detailId} onClose={() => setDetailId(null)} onEdit={openEdit} />
    </div>
  );
}
