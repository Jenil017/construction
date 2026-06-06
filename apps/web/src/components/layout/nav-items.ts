import {
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Primary navigation. Maps to the MVP modules (docs/prd.md). Visibility will be
 * filtered by RBAC permissions once auth lands in Phase 2 — the frontend hides
 * what the user can't access, but the backend remains the security boundary.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: Building2 },
  { label: "Sites", href: "/sites", icon: Building2 },
  { label: "DPR", href: "/dpr", icon: ClipboardList },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Attendance", href: "/attendance", icon: Users },
  { label: "Salary", href: "/salary", icon: Wallet },
  { label: "Expenses", href: "/expenses", icon: Receipt },
  { label: "Purchases", href: "/purchases", icon: ShoppingCart },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Reports", href: "/reports", icon: FileText },
];
