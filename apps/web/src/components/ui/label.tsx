import { cn } from "@/lib/utils";
import type * as React from "react";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: reusable primitive; associated via htmlFor at call sites
    <label
      className={cn(
        "text-[0.8125rem] font-medium leading-none text-foreground/85 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
