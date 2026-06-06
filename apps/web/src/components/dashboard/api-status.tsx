"use client";

import { useHealth } from "@/lib/hooks/use-health";
import { cn } from "@/lib/utils";

/** Small live indicator that the frontend can reach the API. */
export function ApiStatus() {
  const { data, isLoading, isError } = useHealth();

  const state = isLoading ? "checking" : isError ? "down" : "up";
  const label =
    state === "checking" ? "Checking API…" : state === "down" ? "API unreachable" : "API connected";

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span
        className={cn(
          "size-2 rounded-full",
          state === "up" && "bg-green-500",
          state === "down" && "bg-destructive",
          state === "checking" && "bg-yellow-500",
        )}
      />
      <span>{label}</span>
      {data ? <span className="text-xs">({data.environment})</span> : null}
    </div>
  );
}
