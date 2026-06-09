"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";
import {
  type CreateSupplierInput,
  type Supplier,
  type UpdateSupplierInput,
  useCreateSupplier,
  useUpdateSupplier,
} from "@/lib/hooks/use-suppliers";
import { useEffect, useState } from "react";

interface SupplierFormModalProps {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
}

const textareaClass =
  "flex min-h-[72px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50";

export function SupplierFormModal({ open, onClose, supplier }: SupplierFormModalProps) {
  const isEdit = !!supplier;
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();

  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(supplier?.name ?? "");
    setContactPerson(supplier?.contactPerson ?? "");
    setPhone(supplier?.phone ?? "");
    setEmail(supplier?.email ?? "");
    setGstin(supplier?.gstin ?? "");
    setAddress(supplier?.address ?? "");
    setNotes(supplier?.notes ?? "");
  }, [open, supplier]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    const body: CreateSupplierInput & UpdateSupplierInput = {
      name: name.trim(),
      contactPerson: contactPerson.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      gstin: gstin.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit && supplier) await updateSupplier.mutateAsync({ id: supplier.id, body });
      else await createSupplier.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the supplier.");
    }
  };

  const busy = createSupplier.isPending || updateSupplier.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit supplier" : "New supplier"}
      description={isEdit ? supplier?.name : "Add a supplier to this site."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sup-name">Name</Label>
            <Input
              id="sup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Shree Cement Traders"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-contact">Contact person</Label>
            <Input
              id="sup-contact"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-phone">Phone</Label>
            <Input
              id="sup-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-email">Email</Label>
            <Input
              id="sup-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-gstin">GSTIN</Label>
            <Input
              id="sup-gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sup-address">Address</Label>
          <textarea
            id="sup-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="Optional"
            className={textareaClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sup-notes">Notes</Label>
          <Input
            id="sup-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>
        {error ? (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
