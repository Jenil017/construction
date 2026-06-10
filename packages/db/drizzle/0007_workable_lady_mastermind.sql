CREATE TABLE "site_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"sale_date" date NOT NULL,
	"item_description" varchar(200) NOT NULL,
	"material_id" uuid,
	"category" varchar(80) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" varchar(40) NOT NULL,
	"rate_per_unit" numeric(14, 2) NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"buyer_name" varchar(160) NOT NULL,
	"buyer_contact" varchar(60),
	"payment_mode" varchar(40),
	"payment_status" varchar(12) DEFAULT 'unpaid' NOT NULL,
	"amount_received" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "site_sales" ADD CONSTRAINT "site_sales_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_sales" ADD CONSTRAINT "site_sales_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_sales" ADD CONSTRAINT "site_sales_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_sales_site_idx" ON "site_sales" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_sales_site_date_idx" ON "site_sales" USING btree ("site_id","sale_date");--> statement-breakpoint
CREATE INDEX "site_sales_status_idx" ON "site_sales" USING btree ("status");--> statement-breakpoint
CREATE INDEX "site_sales_payment_status_idx" ON "site_sales" USING btree ("payment_status");