import { sql } from "drizzle-orm";
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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
};

export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
