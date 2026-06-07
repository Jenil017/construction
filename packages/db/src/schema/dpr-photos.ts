import { index, integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { dpr } from "./dpr";
import { sites } from "./sites";
import { users } from "./users";

/**
 * Metadata for a DPR photo. The bytes live in R2 (`objectKey`); the DB only
 * holds references. Direct upload uses a presigned PUT URL; display uses a
 * short-lived presigned GET URL (see common/r2). `siteId` is denormalized so a
 * stray photo can never be read/written outside its tenant.
 */
export const dprPhotos = pgTable(
  "dpr_photos",
  {
    ...primaryId,
    dprId: uuid("dpr_id")
      .notNull()
      .references(() => dpr.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    objectKey: varchar("object_key", { length: 400 }).notNull(),
    fileName: varchar("file_name", { length: 255 }),
    contentType: varchar("content_type", { length: 100 }),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("dpr_photos_dpr_idx").on(table.dprId),
    index("dpr_photos_site_idx").on(table.siteId),
  ],
);

export type DprPhoto = typeof dprPhotos.$inferSelect;
export type NewDprPhoto = typeof dprPhotos.$inferInsert;
