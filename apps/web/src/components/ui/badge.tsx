import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground ring-black/5",
        brand: "bg-primary/10 text-primary ring-primary/15",
        teal: "bg-teal/10 text-teal ring-teal/20",
        success: "bg-success/10 text-success ring-success/20",
        warning: "bg-warning/12 text-[var(--accent-foreground)] ring-warning/25",
        danger: "bg-danger/10 text-danger ring-danger/20",
        outline: "text-muted-foreground ring-border",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
