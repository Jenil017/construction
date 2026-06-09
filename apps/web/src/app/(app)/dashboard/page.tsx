import { TodayAttendanceCard } from "@/components/attendance/today-attendance-card";
import { ApiStatus } from "@/components/dashboard/api-status";
import { LowStockCard } from "@/components/inventory/low-stock-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// MVP KPIs from docs/prd.md. Values are placeholders until the modules land;
// "Low Stock Items" and "Today Attendance" are live.
const KPIS = [
  { label: "Total Projects", value: "—" },
  { label: "Active Sites", value: "—" },
  { label: "Today Attendance", value: "—", live: "attendance" as const },
  { label: "Today Expenses", value: "—" },
  { label: "Low Stock Items", value: "—", live: "lowStock" as const },
  { label: "Pending Payments", value: "—" },
  { label: "DPR Completion", value: "—" },
  { label: "Overall Progress", value: "—" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Company-wide overview across all sites.</p>
        </div>
        <ApiStatus />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {KPIS.map((kpi) => {
          if (kpi.live === "lowStock") return <LowStockCard key={kpi.label} />;
          if (kpi.live === "attendance") return <TodayAttendanceCard key={kpi.label} />;
          return (
            <Card key={kpi.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{kpi.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
