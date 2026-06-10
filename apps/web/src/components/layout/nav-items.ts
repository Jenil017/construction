import type { RbacAction, RbacModule } from "@construction-erp/shared";
import {
  Boxes,
  ClipboardList,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  Receipt,
  ShoppingBag,
  ShoppingCart,
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
  /** Only visible to owners (the global site-management capability). */
  ownerOnly?: boolean;
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
  { label: "DPR", href: "/dpr", icon: ClipboardList, module: "dpr", action: "view" },
  { label: "Inventory", href: "/inventory", icon: Boxes, module: "inventory", action: "view" },
  { label: "Attendance", href: "/attendance", icon: Users, module: "attendance", action: "view" },
  { label: "Salary", href: "/salary", icon: Wallet, module: "salary", action: "view" },
  {
    label: "Purchases",
    href: "/purchases",
    icon: ShoppingCart,
    module: "purchases",
    action: "view",
  },
  {
    label: "Selling",
    href: "/selling",
    icon: ShoppingBag,
    module: "selling",
    action: "view",
  },
  { label: "Expenses", href: "/expenses", icon: Receipt, module: "expenses", action: "view" },
  { label: "Reports", href: "/reports", icon: FileText, module: "reports", action: "view" },
];

/** Admin navigation (site + member management). */
export const SETTINGS_ITEMS: NavItem[] = [
  {
    label: "Sites",
    href: "/sites",
    icon: MapPin,
    module: "sites",
    action: "view",
    ownerOnly: true,
  },
  { label: "Users", href: "/settings/users", icon: UserCog, module: "users", action: "view" },
];
