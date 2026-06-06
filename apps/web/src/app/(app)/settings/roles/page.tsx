"use client";

import { RoleFormModal } from "@/components/settings/role-form-modal";
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
import { type Role, useDeleteRole, useRoles } from "@/lib/hooks/use-roles";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

export default function RolesPage() {
  const { can } = useAuth();
  const { data: roles, isLoading, isError, refetch } = useRoles();
  const deleteRole = useDeleteRole();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const canCreate = can("roles", "create");
  const canUpdate = can("roles", "update");
  const canDelete = can("roles", "delete");

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (role: Role) => {
    setEditing(role);
    setModalOpen(true);
  };
  const onDelete = async (role: Role) => {
    if (!window.confirm(`Delete the "${role.name}" role?`)) return;
    try {
      await deleteRole.mutateAsync(role.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not delete the role.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
          <p className="text-sm text-muted-foreground">
            Define module-wise permissions and assign them to users.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add role
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load roles.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !roles || roles.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No roles found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Type</TableHead>
                {canUpdate || canDelete ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {role.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{role.permissions.length}</TableCell>
                  <TableCell>
                    <Badge variant={role.isSystem ? "teal" : "outline"}>
                      {role.isSystem ? "System" : "Custom"}
                    </Badge>
                  </TableCell>
                  {canUpdate || canDelete ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canUpdate ? (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(role)}>
                            Edit
                          </Button>
                        ) : null}
                        {canDelete && !role.isSystem ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => onDelete(role)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <RoleFormModal open={modalOpen} onClose={() => setModalOpen(false)} role={editing} />
    </div>
  );
}
