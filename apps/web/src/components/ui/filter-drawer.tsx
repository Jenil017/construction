"use client";

import { cn } from "@/lib/utils";
import { Filter, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";
import { Input } from "./input";
import { Select } from "./select";

export interface FilterSelectField {
  type: "select";
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface FilterDateField {
  type: "date";
  key: string;
  label: string;
}

export type FilterField = FilterSelectField | FilterDateField;

export type FilterValues = Record<string, string>;

interface FilterDrawerProps {
  fields: FilterField[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  className?: string;
}

export function FilterDrawer({ fields, values, onChange, className }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValues>(values);
  const drawerRef = useRef<HTMLDivElement>(null);

  const activeCount = fields.filter((f) => values[f.key] && values[f.key] !== "").length;

  useEffect(() => {
    if (open) {
      setDraft({ ...values });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, values]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const clear = () => {
    const empty: FilterValues = {};
    for (const f of fields) empty[f.key] = "";
    setDraft(empty);
    onChange(empty);
    setOpen(false);
  };

  const setField = (key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
        activeCount > 0 && "border-primary/50 text-primary",
        className,
      )}
    >
      <Filter className="size-3.5" />
      Filters
      {activeCount > 0 ? (
        <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {activeCount}
        </span>
      ) : null}
    </button>
  );

  if (!open || typeof document === "undefined") return trigger;

  return (
    <>
      {trigger}
      {createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 cursor-default bg-[#0b1220]/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <div
            ref={drawerRef}
            className="relative z-10 flex h-full w-full max-w-xs flex-col bg-card shadow-xl border-l border-border/70"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <h2 className="text-[15px] font-semibold tracking-tight">Filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Fields */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label
                    htmlFor={`filter-${field.key}`}
                    className="block text-sm font-medium text-foreground"
                  >
                    {field.label}
                  </label>
                  {field.type === "select" ? (
                    <Select
                      id={`filter-${field.key}`}
                      value={draft[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                    >
                      <option value="">All</option>
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={`filter-${field.key}`}
                      type="date"
                      value={draft[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex justify-between gap-2 border-t border-border/70 bg-muted/30 px-5 py-4">
              <Button variant="outline" onClick={clear}>
                Clear all
              </Button>
              <Button onClick={apply}>Apply</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
