"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  type SiteRow,
  type SiteStatus,
  type UpdateSiteInput,
  useCreateSite,
  useUpdateSite,
} from "@/lib/hooks/use-sites";
import { useEffect, useState } from "react";

interface SiteFormModalProps {
  open: boolean;
  onClose: () => void;
  site?: SiteRow | null;
}

const STATUS_OPTIONS: { value: SiteStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "completed", label: "Completed" },
];

export function SiteFormModal({ open, onClose, site }: SiteFormModalProps) {
  const isEdit = !!site;
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<SiteStatus>("active");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(site?.name ?? "");
    setCode(site?.code ?? "");
    setStatus(site?.status ?? "active");
    setCity(site?.city ?? "");
    setState(site?.state ?? "");
    setAddress(site?.address ?? "");
  }, [open, site]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Site name is required.");
      return;
    }

    try {
      if (isEdit && site) {
        const body: UpdateSiteInput = {
          name: name.trim(),
          code: code.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          address: address.trim() || null,
          status,
        };
        await updateSite.mutateAsync({ id: site.id, body });
      } else {
        await createSite.mutateAsync({
          name: name.trim(),
          code: code.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          address: address.trim() || undefined,
          status,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the site.");
    }
  };

  const saving = createSite.isPending || updateSite.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit site" : "New site"}
      description={isEdit ? site?.name : "Create a site. Add members from the Users page."}
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
            <Label htmlFor="site-name">Name</Label>
            <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-code">Code</Label>
            <Input
              id="site-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-city">City</Label>
            <Input id="site-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-state">State</Label>
            <Input id="site-state" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="site-status">Status</Label>
            <Select
              id="site-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as SiteStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="site-address">Address</Label>
          <textarea
            id="site-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="Optional"
            className="flex min-h-[72px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
