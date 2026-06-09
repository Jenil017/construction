import { cn } from "@/lib/utils";
import type * as React from "react";

// Inline chevron so every native <select> gets a consistent, styled arrow.
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7480' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/** Lightweight styled native <select> matching the Input look (no extra deps). */
function Select({ className, children, style, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      style={{
        backgroundImage: CHEVRON,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.65rem center",
        backgroundSize: "16px",
        ...style,
      }}
      className={cn(
        "flex h-10 w-full cursor-pointer appearance-none rounded-md border border-input bg-card px-3 py-1 pr-9 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-foreground/25 focus-visible:border-accent-solid focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
