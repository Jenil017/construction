"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type Role,
  useCreateRole,
  usePermissionCatalog,
  useUpdateRole,
} from "@/lib/hooks/use-roles";
import type { Permission, RbacAction, RbacModule, RbacScope } from "@construction-erp/shared";
import { useEffect, useMemo, useState } from "react";
import { PermissionMatrix } from "./permission-matrix";

interface RoleFormModalProps {
  open: boolean;
  onClose: () => void;
  role?: Role | null;
}

export function RoleFormModal({ open, onClose, role }: RoleFormModalProps) {
  const isEdit = !!role;
  const { data: catalog } = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // key "module:action" -> scope (existing scope preserved when editing)
  const [perms, setPerms] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (role) {
      setName(role.name);
      setDescription(role.description ?? "");
      const map = new Map<string, string>();
      for (const p of role.permissions) map.set(`${p.module}:${p.action}`, p.scope);
      setPerms(map);
    } else {
      setName("");
      setDescription("");
      setPerms(new Map());
    }
  }, [open, role]);

  const selected = useMemo(() => new Set(perms.keys()), [perms]);

  const toggle = (module: string, action: string) => {
    setPerms((prev) => {
      const next = new Map(prev);
      const key = `${module}:${action}`;
      if (next.has(key)) next.delete(key);
      else next.set(key, "company");
      return next;
    });
  };

  const toggleModuleAll = (module: string, on: boolean) => {
    setPerms((prev) => {
      const next = new Map(prev);
      for (const a of catalog?.actions ?? []) {
        const key = `${module}:${a}`;
        if (on) {
          if (!next.has(key)) next.set(key, "company");
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    const permissions: Permission[] = [...perms.entries()].map(([key, scope]) => {
      const [module, action] = key.split(":");
      return {
        module: module as RbacModule,
        action: action as RbacAction,
        scope: scope as RbacScope,
      };
    });
    if (permissions.length === 0) {
      setError("Select at least one permission.");
      return;
    }
    try {
      if (isEdit && role) {
        await updateRole.mutateAsync({
          id: role.id,
          body: { name, description: description || null, permissions },
        });
      } else {
        await createRole.mutateAsync({ name, description: description || undefined, permissions });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the role.");
    }
  };

  const saving = createRole.isPending || updateRole.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit role: ${role?.name}` : "Add role"}
      description="Grant module-wise access by checking the actions to allow."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save role"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Site Supervisor"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-desc">Description</Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        {catalog ? (
          <PermissionMatrix
            modules={catalog.modules}
            actions={catalog.actions}
            selected={selected}
            onToggle={toggle}
            onToggleModuleAll={toggleModuleAll}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading permissions…</p>
        )}

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
