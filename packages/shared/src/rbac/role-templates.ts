/**
 * Default role templates seeded per company (see docs/prd.md "RBAC Requirements").
 *
 * Each template is a starting point — the admin can customize permissions per
 * company via the Roles module. `owner` always has full access. Scopes are stored
 * for later site/own row-level enforcement (wired in from Phase 3 once sites exist);
 * for now the backend enforces module+action.
 */

import {
  type Permission,
  RBAC_ACTIONS,
  RBAC_MODULES,
  type RbacAction,
  type RbacModule,
  type RbacScope,
} from "./permissions";

export interface RoleTemplate {
  slug: string;
  name: string;
  description: string;
  /** Marks seeded roles that cannot be deleted (only their permissions edited). */
  isSystem: boolean;
  permissions: Permission[];
}

type ModuleActions = Partial<Record<RbacModule, readonly RbacAction[]>>;

const VIEW = ["view"] as const;
const VIEW_EXPORT = ["view", "export"] as const;
const READ_WRITE = ["view", "create", "update"] as const;
const READ_WRITE_EXPORT = ["view", "create", "update", "export"] as const;
const FULL = RBAC_ACTIONS;

/** Expand a { module: actions } spec into flat permissions at a single scope. */
function build(scope: RbacScope, spec: ModuleActions): Permission[] {
  const permissions: Permission[] = [];
  for (const [module, actions] of Object.entries(spec) as [RbacModule, readonly RbacAction[]][]) {
    for (const action of actions) permissions.push({ module, action, scope });
  }
  return permissions;
}

/** Every module × every action — used by the Owner role. */
function fullAccess(scope: RbacScope): Permission[] {
  const permissions: Permission[] = [];
  for (const module of RBAC_MODULES) {
    for (const action of RBAC_ACTIONS) permissions.push({ module, action, scope });
  }
  return permissions;
}

export const DEFAULT_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    slug: "owner",
    name: "Owner",
    description: "Full access to every module, user, and role within the company.",
    isSystem: true,
    permissions: fullAccess("company"),
  },
  {
    slug: "project_manager",
    name: "Project Manager",
    description: "Runs projects and sites end to end, with approvals across operations.",
    isSystem: true,
    permissions: build("company", {
      dashboard: VIEW,
      projects: FULL,
      sites: FULL,
      dpr: ["view", "create", "update", "approve", "export"],
      inventory: READ_WRITE_EXPORT,
      attendance: ["view", "create", "update", "approve", "export"],
      expenses: ["view", "create", "update", "approve", "export"],
      purchases: ["view", "create", "update", "approve", "export"],
      suppliers: READ_WRITE,
      reports: VIEW_EXPORT,
      users: VIEW,
    }),
  },
  {
    slug: "site_manager",
    name: "Site Manager",
    description: "Manages day-to-day site work: DPR, attendance, and site stock.",
    isSystem: true,
    permissions: build("site", {
      dashboard: VIEW,
      projects: VIEW,
      sites: VIEW,
      dpr: READ_WRITE_EXPORT,
      attendance: READ_WRITE,
      inventory: VIEW,
      expenses: READ_WRITE,
      reports: VIEW_EXPORT,
    }),
  },
  {
    slug: "store_manager",
    name: "Store Manager",
    description: "Owns inventory: inward, outward, transfers, wastage, and low stock.",
    isSystem: true,
    permissions: build("site", {
      dashboard: VIEW,
      projects: VIEW,
      sites: VIEW,
      inventory: ["view", "create", "update", "delete", "export"],
      purchases: VIEW,
      suppliers: VIEW,
      reports: VIEW_EXPORT,
    }),
  },
  {
    slug: "accountant",
    name: "Accountant",
    description: "Handles salary, expenses, and payment approvals across the company.",
    isSystem: true,
    permissions: build("company", {
      dashboard: VIEW,
      attendance: VIEW,
      salary: ["view", "create", "update", "approve", "export"],
      expenses: ["view", "create", "update", "approve", "export"],
      purchases: ["view", "approve", "export"],
      suppliers: VIEW,
      reports: VIEW_EXPORT,
    }),
  },
  {
    slug: "purchase_manager",
    name: "Purchase Manager",
    description: "Manages suppliers, purchase requests, orders, and goods received.",
    isSystem: true,
    permissions: build("company", {
      dashboard: VIEW,
      purchases: ["view", "create", "update", "approve", "export"],
      suppliers: ["view", "create", "update", "delete"],
      inventory: VIEW,
      reports: VIEW_EXPORT,
    }),
  },
  {
    slug: "supervisor",
    name: "Supervisor",
    description: "Records attendance and daily progress on assigned sites.",
    isSystem: true,
    permissions: build("site", {
      dashboard: VIEW,
      sites: VIEW,
      dpr: READ_WRITE,
      attendance: READ_WRITE,
      inventory: VIEW,
      expenses: ["view", "create"],
    }),
  },
  {
    slug: "assistant",
    name: "Assistant",
    description: "Helps with day-to-day data entry on assigned sites.",
    isSystem: true,
    permissions: build("own", {
      dashboard: VIEW,
      dpr: ["view", "create"],
      attendance: ["view", "create"],
      inventory: VIEW,
      expenses: ["view", "create"],
    }),
  },
  {
    slug: "client_viewer",
    name: "Client Viewer",
    description: "Read-only access to progress and reports for clients.",
    isSystem: true,
    permissions: build("company", {
      dashboard: VIEW,
      projects: VIEW,
      sites: VIEW,
      dpr: VIEW_EXPORT,
      reports: VIEW_EXPORT,
    }),
  },
];

/** The slug of the role that grants full access — assigned to the seeded admin. */
export const OWNER_ROLE_SLUG = "owner";
