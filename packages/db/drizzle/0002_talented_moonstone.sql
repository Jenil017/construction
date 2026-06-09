CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"sku" varchar(60),
	"category" varchar(80),
	"unit" varchar(40) NOT NULL,
	"current_stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reorder_level" numeric(14, 3),
	"unit_cost" numeric(14, 2),
	"supplier_ref" varchar(160),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"balance_after" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2),
	"reference" varchar(160),
	"note" text,
	"movement_date" date NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_site_idx" ON "materials" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "materials_site_name_idx" ON "materials" USING btree ("site_id","name");--> statement-breakpoint
CREATE INDEX "materials_category_idx" ON "materials" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_site_sku_uniq" ON "materials" USING btree ("site_id","sku") WHERE "materials"."sku" IS NOT NULL AND "materials"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "stock_movements_site_idx" ON "stock_movements" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "stock_movements_material_idx" ON "stock_movements" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "stock_movements_type_idx" ON "stock_movements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "stock_movements_date_idx" ON "stock_movements" USING btree ("movement_date");