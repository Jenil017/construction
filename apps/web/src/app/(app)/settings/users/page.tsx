"use client";

import { UserFormModal } from "@/components/settings/user-form-modal";
import { Badge } from "@/components/ui/badge";
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
import { type UserRow, useDeleteUser, useUsers } from "@/lib/hooks/use-users";
import { Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";

export default function UsersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const {
    data: users,
    isLoading,
    isError,
    refetch,
  } = useUsers({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const deleteUser = useDeleteUser();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const canCreate = can("users", "create");
  const canUpdate = can("users", "update");
  const canDelete = can("users", "delete");

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (user: UserRow) => {
    setEditing(user);
    setModalOpen(true);
  };
  const onDelete = async (user: UserRow) => {
    if (!window.confirm(`Delete ${user.name}? They will immediately lose access.`)) return;
    try {
      await deleteUser.mutateAsync(user.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Could not delete the user.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage who can access the system and what they can do.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add user
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "disabled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                statusFilter === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <p>Could not load users.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !users || users.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No users found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Roles</TableHead>
                {canUpdate || canDelete ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.status === "active" ? "success" : "danger"}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((r) => (
                        <Badge key={r.id} variant="brand">
                          {r.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {canUpdate || canDelete ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canUpdate ? (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                            Edit
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => onDelete(user)}
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

      <UserFormModal open={modalOpen} onClose={() => setModalOpen(false)} user={editing} />
    </div>
  );
}
