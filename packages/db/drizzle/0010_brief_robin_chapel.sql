-- Sales are now strictly tied to an inventory material. Any legacy/test rows that
-- were entered as free-text (no material link) cannot satisfy the new constraint,
-- so they are removed before it is enforced.
DELETE FROM "site_sales" WHERE "material_id" IS NULL;--> statement-breakpoint
ALTER TABLE "site_sales" ALTER COLUMN "material_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "site_sales_material_idx" ON "site_sales" USING btree ("material_id");--> statement-breakpoint
ALTER TABLE "site_sales" DROP COLUMN "category";