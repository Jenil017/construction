/**
 * Barrel for all Drizzle tables. Module schemas (dpr, inventory, attendance,
 * salary, expenses, purchases, suppliers, ...) are added here as each phase
 * lands. Drizzle Kit reads this file (see drizzle.config.ts).
 *
 * Site is the top-level tenant boundary: Site → members + {DPR, attendance,
 * inventory, expenses, purchases, ...}. Every business table carries `siteId`.
 */
export * from "./_shared";
export * from "./audit-logs";
export * from "./users";
export * from "./refresh-tokens";
export * from "./sites";
export * from "./site-members";
export * from "./site-member-permissions";
export * from "./dpr";
export * from "./dpr-photos";
export * from "./materials";
export * from "./stock-movements";
export * from "./workers";
export * from "./attendance";
export * from "./worker-advances";
export * from "./salary-runs";
export * from "./salary-run-items";
