CREATE TABLE "dpr" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"work_category" varchar(120),
	"location" varchar(200),
	"completed_work" text,
	"pending_work" text,
	"quantity_value" numeric(14, 2),
	"quantity_unit" varchar(40),
	"remarks" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dpr_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dpr_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"object_key" varchar(400) NOT NULL,
	"file_name" varchar(255),
	"content_type" varchar(100),
	"size_bytes" integer,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dpr" ADD CONSTRAINT "dpr_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr" ADD CONSTRAINT "dpr_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr" ADD CONSTRAINT "dpr_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_photos" ADD CONSTRAINT "dpr_photos_dpr_id_dpr_id_fk" FOREIGN KEY ("dpr_id") REFERENCES "public"."dpr"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_photos" ADD CONSTRAINT "dpr_photos_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_photos" ADD CONSTRAINT "dpr_photos_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dpr_site_idx" ON "dpr" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "dpr_date_idx" ON "dpr" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "dpr_status_idx" ON "dpr" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dpr_created_by_idx" ON "dpr" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "dpr_photos_dpr_idx" ON "dpr_photos" USING btree ("dpr_id");--> statement-breakpoint
CREATE INDEX "dpr_photos_site_idx" ON "dpr_photos" USING btree ("site_id");