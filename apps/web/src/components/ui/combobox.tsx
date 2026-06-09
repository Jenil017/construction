"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Small trailing text, e.g. a unit or trade. */
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A searchable, keyboard-navigable select (no deps) — type to filter instead of
 * scrolling a long native list. The dropdown is portaled to <body> with fixed
 * positioning so it never gets clipped inside a scrollable modal.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  id,
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
    : options;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: position only when opening
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: bind/unbind listeners only on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    const reposition = () => place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Capture so we also catch scrolling inside a modal body.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[active];
      if (o) choose(o.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs outline-none transition-[box-shadow,border-color] focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground/70")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/60" />
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popRef}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: pos.width,
                zIndex: 60,
              }}
              className="animate-pop-in overflow-hidden rounded-lg border border-border/70 bg-popover shadow-lg"
            >
              <div className="flex items-center gap-2 border-b border-border/70 px-3">
                <Search className="size-4 shrink-0 text-muted-foreground/60" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                />
              </div>
              <ul className="max-h-60 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {emptyText}
                  </li>
                ) : (
                  filtered.map((o, i) => (
                    <li key={o.value || "__none__"}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(o.value)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                        )}
                      >
                        <Check
                          className={cn(
                            "size-4 shrink-0 text-accent-foreground",
                            o.value === value ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {o.hint ? (
                          <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
