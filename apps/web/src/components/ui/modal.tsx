"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Lightweight modal (no radix dependency). Mobile-first: slides up as a sheet on
 * small screens, centers as a dialog on larger ones. Closes on Escape / backdrop.
 */
export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-[#0b1220]/45 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border/70 bg-card shadow-xl animate-pop-in sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-border/70 bg-muted/30 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
