CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"report_type" varchar(40) NOT NULL,
	"format" varchar(8) NOT NULL,
	"status" varchar(12) DEFAULT 'queued' NOT NULL,
	"params" jsonb,
	"file_name" varchar(200),
	"object_key" varchar(300),
	"file_size" integer,
	"row_count" integer,
	"error_message" varchar(300),
	"attempts" integer DEFAULT 0 NOT NULL,
	"correlation_id" varchar(64),
	"requested_by_user_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_jobs_site_idx" ON "export_jobs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "export_jobs_site_status_idx" ON "export_jobs" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "export_jobs_requested_by_idx" ON "export_jobs" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "export_jobs_created_idx" ON "export_jobs" USING btree ("created_at");