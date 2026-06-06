import type { RbacAction, RbacModule } from "@construction-erp/shared";
import {
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Required permission to see this item. Backend remains the security boundary. */
  module: RbacModule;
  action: RbacAction;
}

/** Primary navigation (MVP modules). Filtered by the user's view permission. */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    module: "dashboard",
    action: "view",
  },
  { label: "Projects", href: "/projects", icon: Building2, module: "projects", action: "view" },
  { label: "Sites", href: "/sites", icon: MapPin, module: "sites", action: "view" },
  { label: "DPR", href: "/dpr", icon: ClipboardList, module: "dpr", action: "view" },
  { label: "Inventory", href: "/inventory", icon: Boxes, module: "inventory", action: "view" },
  { label: "Attendance", href: "/attendance", icon: Users, module: "attendance", action: "view" },
  { label: "Salary", href: "/salary", icon: Wallet, module: "salary", action: "view" },
  { label: "Expenses", href: "/expenses", icon: Receipt, module: "expenses", action: "view" },
  {
    label: "Purchases",
    href: "/purchases",
    icon: ShoppingCart,
    module: "purchases",
    action: "view",
  },
  { label: "Suppliers", href: "/suppliers", icon: Truck, module: "suppliers", action: "view" },
  { label: "Reports", href: "/reports", icon: FileText, module: "reports", action: "view" },
];

/** Admin navigation (user + role management). */
export const SETTINGS_ITEMS: NavItem[] = [
  { label: "Users", href: "/settings/users", icon: UserCog, module: "users", action: "view" },
  { label: "Roles", href: "/settings/roles", icon: ShieldCheck, module: "roles", action: "view" },
];
