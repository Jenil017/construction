"use client";

import { SiteFormModal } from "@/components/sites/site-form-modal";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { type SiteRow, type SiteStatus, useDeleteSite, useSites } from "@/lib/hooks/use-sites";
import { Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";

const STATUS_META: Record<SiteStatus, { label: string; variant: BadgeProps["variant"] }> = {
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "default" },
  completed: { label: "Completed", variant: "brand" },
};

export default function SitesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SiteStatus>("all");
  const {
    data: sites,
    isLoading,
    isError,
    refetch,
  } = useSites({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const deleteSite = useDeleteSite();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRow | null>(null);

  // Site management is owner-only.
  const canManage = !!user?.isAppOwner;

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (site: SiteRow) => {
    setEditing(site);
    setModalOpen(true);
  };
  const onDelete = async (site: SiteRow) => {
    if (!window.confirm(`Delete ${site.name}? Members will lose access to it.`)) return;
    try {
      await deleteSite.mutateAsync(site.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not delete the site.");
    }
  };

  const location = (site: SiteRow) => [site.city, site.state].filter(Boolean).join(", ") || "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage your sites. Switch the active site from the top bar to work in one.
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New site
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or code"
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | SiteStatus)}
          className="w-auto"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="completed">Completed</option>
        </Select>
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load sites.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !sites || sites.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No sites found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => {
                const meta = STATUS_META[site.status];
                return (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">
                      {site.name}
                      {site.code ? (
                        <span className="ml-1 text-xs text-muted-foreground">({site.code})</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{location(site)}</TableCell>
                    <TableCell>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {site.memberCount > 0
                        ? `${site.memberCount} member${site.memberCount > 1 ? "s" : ""}`
                        : "—"}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(site)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => onDelete(site)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <SiteFormModal open={modalOpen} onClose={() => setModalOpen(false)} site={editing} />
    </div>
  );
}
