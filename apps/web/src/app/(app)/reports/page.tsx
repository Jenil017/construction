"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  type ExportFormat,
  type ExportJob,
  type ExportStatus,
  fetchDownloadLink,
  useCreateExport,
  useDeleteExport,
  useExports,
  useReportTypes,
} from "@/lib/hooks/use-reports";
import { Download, FileSpreadsheet, FileText, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

const STATUS_VARIANT: Record<ExportStatus, BadgeProps["variant"]> = {
  queued: "outline",
  processing: "warning",
  completed: "success",
  failed: "danger",
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function triggerDownload(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function ReportsPage() {
  const { can } = useAuth();
  const canExport = can("reports", "export");
  const canDelete = can("reports", "delete");

  const { data: types } = useReportTypes();
  const { data: jobs, isLoading, isError, refetch } = useExports();
  const createExport = useCreateExport();
  const deleteExport = useDeleteExport();

  const [reportType, setReportType] = useState("");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const selected = types?.find((t) => t.key === reportType);

  const onGenerate = async () => {
    if (!reportType) return;
    try {
      await createExport.mutateAsync({
        reportType,
        format,
        params:
          selected?.dateRange && (dateFrom || dateTo)
            ? { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }
            : undefined,
      });
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not start the export.");
    }
  };

  const onDownload = async (job: ExportJob) => {
    setDownloadingId(job.id);
    try {
      const { url } = await fetchDownloadLink(job.id);
      triggerDownload(url);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not get the download link.");
    } finally {
      setDownloadingId(null);
    }
  };

  const onDelete = async (job: ExportJob) => {
    if (!window.confirm("Delete this export?")) return;
    try {
      await deleteExport.mutateAsync(job.id);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not delete the export.");
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Generate PDF and spreadsheet (CSV) exports. Generation runs in the background — the status
          updates here and a download link appears when it's ready.
        </p>
      </div>

      {canExport ? (
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Generate an export</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="reportType">Report</Label>
              <Select
                id="reportType"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="">Select a report…</option>
                {types?.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="format">Format</Label>
              <Select
                id="format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
              >
                <option value="csv">Excel (CSV)</option>
                <option value="pdf">PDF</option>
              </Select>
            </div>
            {selected?.dateRange ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="dateFrom">From</Label>
                  <Input
                    id="dateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dateTo">To</Label>
                  <Input
                    id="dateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={onGenerate} disabled={!reportType || createExport.isPending}>
              {createExport.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : format === "pdf" ? (
                <FileText className="size-4" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              Generate
            </Button>
            {selected ? (
              <p className="text-xs text-muted-foreground">{selected.description}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load exports.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No exports yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.reportLabel}</TableCell>
                    <TableCell className="uppercase text-muted-foreground">{job.format}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                      {job.status === "failed" && job.errorMessage ? (
                        <p className="mt-1 max-w-[16rem] text-xs text-danger">{job.errorMessage}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {job.rowCount ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatSize(job.fileSize)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {job.status === "completed" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDownload(job)}
                            disabled={downloadingId === job.id}
                          >
                            {downloadingId === job.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Download className="size-4" />
                            )}
                            Download
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => onDelete(job)}
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
          </div>
        )}
      </div>
    </div>
  );
}
