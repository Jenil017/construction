import { cn } from "@/lib/utils";
import type * as React from "react";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      {/* min-width forces horizontal scroll on small screens instead of crushing
          columns (see docs/UX_playbook.md §12). */}
      <table
        className={cn("w-full min-w-[560px] caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-muted/40 [&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn("border-b border-border/70 transition-colors hover:bg-accent/40", className)}
      {...props}
    />
  );
}

// Consistent gutters everywhere: 16px between columns, a slightly wider 20px/24px
// inset on the first/last cell so content never hugs the card edge. Headers and
// body cells share the exact same horizontal padding so columns stay aligned.
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-11 whitespace-nowrap px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
