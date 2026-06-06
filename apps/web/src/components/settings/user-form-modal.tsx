"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import { useRoles } from "@/lib/hooks/use-roles";
import {
  type UpdateUserInput,
  type UserRow,
  useCreateUser,
  useUpdateUser,
} from "@/lib/hooks/use-users";
import { useEffect, useState } from "react";

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  user?: UserRow | null;
}

export function UserFormModal({ open, onClose, user }: UserFormModalProps) {
  const isEdit = !!user;
  const { data: roles } = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone ?? "");
      setStatus(user.status === "disabled" ? "disabled" : "active");
      setRoleIds(user.roles.map((r) => r.id));
      setPassword("");
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setStatus("active");
      setRoleIds([]);
      setPassword("");
    }
  }, [open, user]);

  const toggleRole = (id: string) => {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!isEdit) {
      if (!email.trim()) {
        setError("Email is required.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
    } else if (password && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (roleIds.length === 0) {
      setError("Select at least one role.");
      return;
    }

    try {
      if (isEdit && user) {
        const body: UpdateUserInput = { name, phone: phone || null, status, roleIds };
        if (password) body.password = password;
        await updateUser.mutateAsync({ id: user.id, body });
      } else {
        await createUser.mutateAsync({
          name,
          email: email.trim(),
          password,
          phone: phone || undefined,
          roleIds,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the user.");
    }
  };

  const saving = createUser.isPending || updateUser.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit user" : "Add user"}
      description={isEdit ? user?.email : "Create a user and assign their roles."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="user-name">Name</Label>
            <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-phone">Phone</Label>
            <Input
              id="user-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-password">{isEdit ? "New password" : "Password"}</Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "Leave blank to keep" : "Min 8 characters"}
              autoComplete="new-password"
            />
          </div>
        </div>

        {isEdit ? (
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex gap-2">
              {(["active", "disabled"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                    status === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label>Roles</Label>
          <div className="grid gap-1.5 rounded-md border p-3 sm:grid-cols-2">
            {(roles ?? []).map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                  className="size-4 accent-[var(--primary)]"
                />
                {role.name}
              </label>
            ))}
            {roles && roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles available.</p>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
