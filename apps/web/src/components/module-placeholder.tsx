import { Construction } from "lucide-react";

/** Placeholder for MVP modules delivered in later phases (see docs/plan.md). */
export function ModulePlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Part of the construction ERP MVP.</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card py-20 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Construction className="size-6" />
        </span>
        <div>
          <p className="font-medium">Coming soon</p>
          <p className="text-sm text-muted-foreground">This module is delivered in {phase}.</p>
        </div>
      </div>
    </div>
  );
}
