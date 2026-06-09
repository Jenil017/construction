import { cn } from "@/lib/utils";
import type * as React from "react";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: reusable primitive; associated via htmlFor at call sites
    <label
      className={cn(
        "text-[0.72rem] font-bold uppercase leading-none tracking-[0.04em] text-foreground/65 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
