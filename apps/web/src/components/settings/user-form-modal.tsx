"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type ModulePermission,
  type UpdateUserInput,
  type UserRow,
  useCreateUser,
  useUpdateUser,
} from "@/lib/hooks/use-users";
import type { AccessLevel, RbacModule } from "@construction-erp/shared";
import { UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  user?: UserRow | null;
}

type Grant = "none" | AccessLevel;

/** Modules a member can be granted on a site, with friendly labels. */
const MODULES: { module: RbacModule; label: string }[] = [
  { module: "dashboard", label: "Dashboard" },
  { module: "dpr", label: "DPR" },
  { module: "inventory", label: "Inventory" },
  { module: "attendance", label: "Attendance" },
  { module: "salary", label: "Salary" },
  { module: "expenses", label: "Expenses" },
  { module: "purchases", label: "Purchases" },
  { module: "suppliers", label: "Suppliers" },
  { module: "reports", label: "Reports" },
  { module: "users", label: "Users" },
];

const ALL_MODULES = MODULES.map((m) => m.module);

/** Quick presets that pre-fill the access grid. */
const PRESETS: { key: string; label: string; build: () => Record<string, Grant> }[] = [
  {
    key: "read_only",
    label: "Read-only",
    build: () => Object.fromEntries(ALL_MODULES.map((m) => [m, "read"])),
  },
  {
    key: "site_manager",
    label: "Site Manager",
    build: () => {
      const write = new Set<RbacModule>([
        "dashboard",
        "dpr",
        "attendance",
        "inventory",
        "expenses",
        "reports",
      ]);
      return Object.fromEntries(ALL_MODULES.map((m) => [m, write.has(m) ? "read_write" : "read"]));
    },
  },
  {
    key: "partner",
    label: "Partner",
    build: () => Object.fromEntries(ALL_MODULES.map((m) => [m, "read_write"])),
  },
];

function emptyGrid(): Record<string, Grant> {
  return Object.fromEntries(ALL_MODULES.map((m) => [m, "none"]));
}

export function UserFormModal({ open, onClose, user }: UserFormModalProps) {
  const isEdit = !!user;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [grid, setGrid] = useState<Record<string, Grant>>(emptyGrid);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPassword("");
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone ?? "");
      setStatus(user.status === "disabled" ? "disabled" : "active");
      const next = emptyGrid();
      for (const p of user.permissions) next[p.module] = p.level;
      setGrid(next);
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setStatus("active");
      setGrid(emptyGrid());
    }
  }, [open, user]);

  const setGrant = (module: string, grant: Grant) =>
    setGrid((prev) => ({ ...prev, [module]: grant }));

  const permissions = useMemo<ModulePermission[]>(
    () =>
      ALL_MODULES.filter((m) => grid[m] !== "none").map((m) => ({
        module: m,
        level: grid[m] as AccessLevel,
      })),
    [grid],
  );

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
    if (permissions.length === 0) {
      setError("Grant access to at least one module.");
      return;
    }

    try {
      if (isEdit && user) {
        const body: UpdateUserInput = { name, phone: phone || null, status, permissions };
        if (password) body.password = password;
        await updateUser.mutateAsync({ id: user.id, body });
      } else {
        await createUser.mutateAsync({
          name,
          email: email.trim(),
          password,
          phone: phone || undefined,
          permissions,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the member.");
    }
  };

  const saving = createUser.isPending || updateUser.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={UserPlus}
      size="lg"
      title={isEdit ? "Edit member" : "Add member"}
      description={
        isEdit ? user?.email : "Add someone to this site (new or existing) and set their access."
      }
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

        {!isEdit ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            If this email already belongs to a user, they'll be added to this site (the password is
            ignored).
          </p>
        ) : null}

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

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Access on this site</Label>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setGrid(p.build())}
                  className="rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y rounded-md border">
            {MODULES.map(({ module, label }) => (
              <div
                key={module}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5"
              >
                <span className="text-sm">{label}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {(
                    [
                      ["none", "None"],
                      ["read", "Read"],
                      ["read_write", "Read & Write"],
                    ] as const
                  ).map(([value, lbl]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGrant(module, value)}
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        grid[module] === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
