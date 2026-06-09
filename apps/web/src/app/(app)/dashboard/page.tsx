"use client";

import { TodayAttendanceCard } from "@/components/attendance/today-attendance-card";
import { ApiStatus } from "@/components/dashboard/api-status";
import { TodayExpensesCard } from "@/components/expenses/today-expenses-card";
import { LowStockCard } from "@/components/inventory/low-stock-card";
import { PendingPaymentsCard } from "@/components/purchases/pending-payments-card";
import { useAuth } from "@/lib/auth/auth-context";
import type { RbacAction, RbacModule } from "@construction-erp/shared";
import {
  Boxes,
  ChevronRight,
  ClipboardList,
  FileText,
  type LucideIcon,
  Receipt,
  ShoppingCart,
  Users,
} from "lucide-react";
import Link from "next/link";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  module: RbacModule;
  action: RbacAction;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "New DPR", href: "/dpr?new=1", icon: ClipboardList, module: "dpr", action: "create" },
  {
    label: "Mark attendance",
    href: "/attendance",
    icon: Users,
    module: "attendance",
    action: "create",
  },
  {
    label: "Add expense",
    href: "/expenses?new=1",
    icon: Receipt,
    module: "expenses",
    action: "create",
  },
  {
    label: "Add material",
    href: "/inventory?new=1",
    icon: Boxes,
    module: "inventory",
    action: "create",
  },
  {
    label: "New purchase",
    href: "/purchases?new=1",
    icon: ShoppingCart,
    module: "purchases",
    action: "create",
  },
  {
    label: "Generate report",
    href: "/reports",
    icon: FileText,
    module: "reports",
    action: "export",
  },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

export default function DashboardPage() {
  const { user, activeSite, can } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const actions = QUICK_ACTIONS.filter((a) => can(a.module, a.action));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeSite?.name ? (
              <>
                <span className="font-medium text-foreground/80">{activeSite.name}</span>
                <span className="px-1.5 text-muted-foreground/50">·</span>
              </>
            ) : null}
            {dateStr}
          </p>
        </div>
        <ApiStatus />
      </header>

      <section>
        <SectionLabel>Today at a glance</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <TodayAttendanceCard />
          <TodayExpensesCard />
          <LowStockCard />
          <PendingPaymentsCard />
        </div>
      </section>

      {actions.length > 0 ? (
        <section>
          <SectionLabel>Quick actions</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-accent-solid/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-accent-solid/15 group-hover:text-accent-foreground">
                  <a.icon className="size-[1.05rem]" />
                </span>
                <span className="min-w-0 truncate text-sm font-medium">{a.label}</span>
                <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-foreground" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
