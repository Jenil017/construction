import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Reusable column groups enforcing the project-wide DB conventions
 * (see docs/backend_guideline.md + docs/architecter.md):
 *   - every business row has a primary uuid
 *   - audit timestamps on every table
 *   - soft deletes via `deletedAt` (never hard-delete business records)
 *
 * Spread these into table definitions to keep conventions consistent.
 */

export const primaryId = {
  id: uuid("id").primaryKey().defaultRandom(),
};

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // `$onUpdate` returns a JS Date (mapped to the driver) rather than `sql\`now()\``:
  // drizzle maps the set value via the column's mapToDriverValue, and an inlined
  // SQL expression there is not handled, so a Date is the reliable idiom.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
