"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
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
import { optionalStringMax, requiredString } from "@/lib/validation/forms";
import { type AccessLevel, type RbacModule, emailSchema } from "@construction-erp/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(100);

/**
 * Password is required when creating a user but optional on edit ("leave blank
 * to keep"), and email is locked on edit — so the schema depends on the mode.
 * Maxes mirror `users.schemas.ts`.
 */
function buildSchema(isEdit: boolean) {
  return z.object({
    name: requiredString(120, "Name is required."),
    email: isEdit ? z.string() : emailSchema,
    password: isEdit ? z.union([z.literal(""), passwordSchema]) : passwordSchema,
    phone: optionalStringMax(20),
  });
}

type UserFormValues = z.input<ReturnType<typeof buildSchema>>;

const EMPTY: UserFormValues = { name: "", email: "", password: "", phone: "" };

export function UserFormModal({ open, onClose, user }: UserFormModalProps) {
  const isEdit = !!user;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [grid, setGrid] = useState<Record<string, Grant>>(emptyGrid);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(buildSchema(isEdit)),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (user) {
      reset({ name: user.name, email: user.email, password: "", phone: user.phone ?? "" });
      setStatus(user.status === "disabled" ? "disabled" : "active");
      const next = emptyGrid();
      for (const p of user.permissions) next[p.module] = p.level;
      setGrid(next);
    } else {
      reset(EMPTY);
      setStatus("active");
      setGrid(emptyGrid());
    }
  }, [open, user, reset]);

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

  const onSubmit = handleSubmit(async (raw) => {
    setError(null);
    // The access grid lives outside the form, so it is still checked by hand.
    if (permissions.length === 0) {
      setError("Grant access to at least one module.");
      return;
    }
    const values = raw as unknown as {
      name: string;
      email: string;
      password: string;
      phone: string | null;
    };

    try {
      if (isEdit && user) {
        const body: UpdateUserInput = {
          name: values.name,
          phone: values.phone,
          status,
          permissions,
        };
        if (values.password) body.password = values.password;
        await updateUser.mutateAsync({ id: user.id, body });
      } else {
        await createUser.mutateAsync({
          name: values.name,
          email: values.email,
          password: values.password,
          phone: values.phone ?? undefined,
          permissions,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the member.");
    }
  });

  const saving = isSubmitting || createUser.isPending || updateUser.isPending;

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
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="user-name" required error={errors.name?.message}>
            <Input id="user-name" {...register("name")} />
          </Field>
          <Field label="Email" htmlFor="user-email" required error={errors.email?.message}>
            <Input id="user-email" type="email" disabled={isEdit} {...register("email")} />
          </Field>
          <Field label="Phone" htmlFor="user-phone" error={errors.phone?.message}>
            <Input
              id="user-phone"
              type="tel"
              inputMode="numeric"
              placeholder="Optional"
              {...register("phone")}
            />
          </Field>
          <Field
            label={isEdit ? "New password" : "Password"}
            htmlFor="user-password"
            required={!isEdit}
            error={errors.password?.message}
          >
            <Input
              id="user-password"
              type="password"
              placeholder={isEdit ? "Leave blank to keep" : "Min 8 characters"}
              autoComplete="new-password"
              {...register("password")}
            />
          </Field>
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
                  className="flex h-9 items-center rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent sm:h-7"
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
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-sm">{label}</span>
                {/* 3-up segmented control on mobile. `h-10` keeps the tap target
                    usable at ~100px-wide cells; the short "Write" label avoids the
                    two-line wrap that "Read & Write" causes at that width. */}
                <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:justify-end">
                  {(
                    [
                      ["none", "None", "None"],
                      ["read", "Read", "Read"],
                      ["read_write", "Write", "Read & Write"],
                    ] as const
                  ).map(([value, shortLabel, fullLabel]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGrant(module, value)}
                      aria-label={fullLabel}
                      className={`flex h-10 items-center justify-center rounded-md border px-2 text-xs transition-colors sm:h-8 ${
                        grid[module] === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <span className="sm:hidden">{shortLabel}</span>
                      <span className="hidden sm:inline">{fullLabel}</span>
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
      </form>
    </Modal>
  );
}
