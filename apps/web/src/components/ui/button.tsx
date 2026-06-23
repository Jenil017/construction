import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-[var(--primary-hover)]",
        accent: "bg-accent-solid text-[#231504] shadow-sm hover:brightness-[1.04]",
        destructive: "bg-destructive text-white shadow-sm hover:brightness-110",
        outline:
          "border border-input bg-card shadow-xs hover:border-accent-solid/45 hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-accent-foreground underline-offset-4 hover:underline",
      },
      size: {
        // Mobile-first: 44px tall for comfortable touch, stepping down to the
        // denser desktop size at sm+ where pointer precision is higher.
        default: "h-11 px-4 py-2 sm:h-10",
        sm: "h-9 rounded-md px-3 text-xs sm:h-8",
        lg: "h-11 rounded-lg px-6 text-[15px]",
        icon: "size-11 sm:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
