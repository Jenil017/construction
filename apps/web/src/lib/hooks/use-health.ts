"use client";

import { apiFetch } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";

interface Health {
  status: string;
  service: string;
  environment: string;
  timestamp: string;
}

/** Example module hook pattern: server state lives in TanStack Query, never inline fetch. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<Health>("/health"),
    refetchInterval: 30_000,
  });
}
