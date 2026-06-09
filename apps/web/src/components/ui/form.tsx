import { cn } from "@/lib/utils";
import type * as React from "react";
import { Label } from "./label";

/**
 * Form layout primitives (see docs/UX_playbook.md §5). Compose every form as
 * FormSection → FormRow → Field so spacing, labels, and responsive collapse are
 * identical everywhere instead of hand-rolled per form.
 */

const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

/** A responsive grid of fields: N columns on sm+, 1 column on mobile. */
export function FormRow({
  columns = 1,
  className,
  children,
}: {
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("grid gap-x-4 gap-y-4", COLUMNS[columns], className)}>{children}</div>;
}

/** A titled group of rows. */
export function FormSection({
  title,
  description,
  className,
  children,
}: {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {title ? (
        <div className="space-y-0.5">
          <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-foreground/55">
            {title}
          </h3>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Label + required marker + control, with an optional hint or error below. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? (
            <span className="ml-0.5 text-danger" aria-label="required">
              *
            </span>
          ) : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
