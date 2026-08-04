ALTER TABLE "sites" DROP CONSTRAINT "sites_code_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sites_owner_code_uq" ON "sites" USING btree ("owner_user_id","code") WHERE "sites"."code" is not null;