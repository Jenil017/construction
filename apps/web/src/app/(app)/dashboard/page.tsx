"use client";

import { TodayAttendanceCard } from "@/components/attendance/today-attendance-card";
import { ApiStatus } from "@/components/dashboard/api-status";
import { AttendanceWeekCard } from "@/components/dashboard/attendance-week-card";
import { ExpenseWeekCard } from "@/components/dashboard/expense-week-card";
import { LowStockPanel } from "@/components/dashboard/low-stock-panel";
import { RecentDprPanel } from "@/components/dashboard/recent-dpr-panel";
import { TodayExpensesCard } from "@/components/expenses/today-expenses-card";
import { PendingPaymentsCard } from "@/components/purchases/pending-payments-card";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import { useDprList } from "@/lib/hooks/use-dpr";
import type { RbacAction, RbacModule } from "@construction-erp/shared";
import {
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileText,
  type LucideIcon,
  Receipt,
  ShoppingCart,
  Users,
  Zap,
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

function DprPendingCard() {
  const { data: dprs, isLoading } = useDprList({ status: "submitted" });
  const count = dprs?.length ?? 0;
  return (
    <StatCard
      label="DPR pending"
      value={count}
      icon={ClipboardCheck}
      href="/dpr"
      tone={count > 0 ? "amber" : "navy"}
      emphasize={count > 0}
      loading={isLoading}
      hint={count > 0 ? "Awaiting approval" : "All reviewed"}
    />
  );
}

function QuickActionsPanel({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
          <Zap className="size-3.5" />
        </span>
        <span className="text-sm font-semibold">Quick actions</span>
      </div>
      <div className="mt-3 grid flex-1 grid-cols-2 content-start gap-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-2.5 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-sm font-medium transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <a.icon className="size-3.5" />
            </span>
            <span className="min-w-0 truncate">{a.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[0.68rem] font-semibold uppercase tracking-widest text-muted-foreground">
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
    year: "numeric",
  });
  const actions = QUICK_ACTIONS.filter((a) => can(a.module, a.action));

  return (
    <div className="space-y-7">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/50 pb-5">
        <div>
          {activeSite?.name ? (
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-primary">
              {activeSite.name}
            </p>
          ) : null}
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{dateStr}</p>
        </div>
        <ApiStatus />
      </header>

      {/* ── Today at a glance ──────────────────────────────────── */}
      <section>
        <SectionLabel>Today at a glance</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <TodayAttendanceCard />
          <TodayExpensesCard />
          <DprPendingCard />
          <PendingPaymentsCard />
        </div>
      </section>

      {/* ── 7-day trends ──────────────────────────────────────── */}
      <section>
        <SectionLabel>7-day trends</SectionLabel>
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          <ExpenseWeekCard />
          <AttendanceWeekCard />
        </div>
      </section>

      {/* ── Activity + inventory ──────────────────────────────── */}
      <section>
        <SectionLabel>Activity &amp; alerts</SectionLabel>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <LowStockPanel />
          <RecentDprPanel />
          <QuickActionsPanel actions={actions} />
        </div>
      </section>
    </div>
  );
}
