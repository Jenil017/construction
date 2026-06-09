import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";
import { workers } from "./workers";

/**
 * One day's attendance for one worker (see docs/prd.md "Attendance And Salary").
 * Site-scoped. At most one (non-deleted) record per (site, worker, date) — re-marking
 * the same day updates the existing row (an upsert handled in the service). `status`
 * drives payable days at salary time: present = 1.0, half_day = 0.5, absent = 0.0,
 * plus `overtimeHours` paid at the worker's overtime rate.
 *
 * Approval gate: salary is generated only from APPROVED attendance (the
 * docs/architecter.md "attendance approval → salary generation" critical op).
 * Once approved a row is locked from edits (corrections require un-approval first).
 */
export const attendance = pgTable(
  "attendance",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    // present | absent | half_day
    status: varchar("status", { length: 12 }).notNull(),
    overtimeHours: numeric("overtime_hours", { precision: 6, scale: 2 }).notNull().default("0"),
    note: varchar("note", { length: 200 }),
    approved: boolean("approved").notNull().default(false),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    markedByUserId: uuid("marked_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("attendance_site_idx").on(table.siteId),
    index("attendance_site_date_idx").on(table.siteId, table.attendanceDate),
    index("attendance_worker_idx").on(table.workerId),
    index("attendance_status_idx").on(table.status),
    // One live record per worker per day.
    uniqueIndex("attendance_worker_date_uniq")
      .on(table.siteId, table.workerId, table.attendanceDate)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
