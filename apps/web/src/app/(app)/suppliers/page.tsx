"use client";

import { SupplierFormModal } from "@/components/suppliers/supplier-form-modal";
import { Button } from "@/components/ui/button";
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
import { type Supplier, useDeleteSupplier, useSuppliers } from "@/lib/hooks/use-suppliers";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

export default function SuppliersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const {
    data: suppliers,
    isLoading,
    isError,
    refetch,
  } = useSuppliers({ search: search || undefined });
  const deleteSupplier = useDeleteSupplier();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const canCreate = can("suppliers", "create");
  const canUpdate = can("suppliers", "update");
  const canDelete = can("suppliers", "delete");

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const onDelete = async (s: Supplier) => {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    try {
      await deleteSupplier.mutateAsync(s.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not delete the supplier.");
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            Manage this site's vendors and their details.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Add supplier
          </Button>
        ) : null}
      </div>

      <div className="relative sm:max-w-xs">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, contact, phone, GSTIN"
          className="pl-8"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load suppliers.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !suppliers || suppliers.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No suppliers yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.contactPerson ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.gstin ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canUpdate ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(s);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:text-danger"
                          onClick={() => onDelete(s)}
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

      <SupplierFormModal open={formOpen} onClose={() => setFormOpen(false)} supplier={editing} />
    </div>
  );
}
