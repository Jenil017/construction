"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Tinted icon chip in the header (ties forms to the dashboard look). */
  icon?: LucideIcon;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SIZE: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

/**
 * Lightweight modal (no radix dependency). Mobile-first: slides up as a sheet on
 * small screens, centers as a dialog on larger ones. Closes on Escape / backdrop.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  size = "md",
  children,
  footer,
}: ModalProps) {
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

  if (!open || typeof document === "undefined") return null;

  // Portal to <body> so the overlay is positioned against the viewport — never
  // confined by an ancestor's transform (e.g. the page-load reveal) or overflow.
  return createPortal(
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
      {/* `dvh` not `vh`: on mobile `vh` is the *large* viewport, so a `92vh` sheet
          extends under the browser chrome — and under the on-screen keyboard the
          moment a field in it takes focus. `dvh` tracks the visible area. */}
      <div
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border/70 bg-card shadow-xl animate-pop-in sm:max-h-[90dvh] sm:rounded-2xl",
          SIZE[size],
        )}
      >
        <div className="flex items-start gap-3 border-b border-border/70 px-5 py-4">
          {Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-[1.05rem]" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:size-9"
          >
            <X className="size-4" />
          </button>
        </div>
        {/* When there's no footer the body is the bottom edge, so it takes the
            inset instead. `overscroll-contain` stops a scroll that reaches the
            end of this pane from chaining to the page behind the sheet. */}
        <div
          className={cn(
            "overflow-y-auto overscroll-contain px-5 pt-5",
            footer ? "pb-5" : "pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5",
          )}
        >
          {children}
        </div>
        {/* The sheet is flush to the bottom edge on mobile, so the footer is what
            sits over the home indicator — it carries the inset, not the sheet.
            Falls back to the plain `py-4` on every device reporting a 0 inset. */}
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-border/70 bg-muted/30 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
