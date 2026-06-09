CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"phone" varchar(20),
	"trade" varchar(80),
	"daily_wage" numeric(12, 2) DEFAULT '0' NOT NULL,
	"overtime_rate" numeric(12, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"status" varchar(12) NOT NULL,
	"overtime_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"note" varchar(200),
	"approved" boolean DEFAULT false NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"marked_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "worker_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"advance_date" date NOT NULL,
	"note" varchar(200),
	"settled_in_run_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "salary_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_workers" integer DEFAULT 0 NOT NULL,
	"total_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_advances" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_net" numeric(14, 2) DEFAULT '0' NOT NULL,
	"generated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "salary_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"worker_name" varchar(160) NOT NULL,
	"present_days" integer DEFAULT 0 NOT NULL,
	"half_days" integer DEFAULT 0 NOT NULL,
	"payable_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"overtime_hours" numeric(7, 2) DEFAULT '0' NOT NULL,
	"daily_wage" numeric(12, 2) NOT NULL,
	"overtime_rate" numeric(12, 2),
	"gross" numeric(14, 2) NOT NULL,
	"advance_deducted" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_payable" numeric(14, 2) NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_status" varchar(12) DEFAULT 'unpaid' NOT NULL,
	"payment_mode" varchar(40),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_user_id_users_id_fk" FOREIGN KEY ("marked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_advances" ADD CONSTRAINT "worker_advances_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_advances" ADD CONSTRAINT "worker_advances_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_advances" ADD CONSTRAINT "worker_advances_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_runs" ADD CONSTRAINT "salary_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_runs" ADD CONSTRAINT "salary_runs_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_run_items" ADD CONSTRAINT "salary_run_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_run_items" ADD CONSTRAINT "salary_run_items_run_id_salary_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."salary_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_run_items" ADD CONSTRAINT "salary_run_items_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workers_site_idx" ON "workers" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "workers_site_name_idx" ON "workers" USING btree ("site_id","name");--> statement-breakpoint
CREATE INDEX "attendance_site_idx" ON "attendance" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "attendance_site_date_idx" ON "attendance" USING btree ("site_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_worker_idx" ON "attendance" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "attendance_status_idx" ON "attendance" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_worker_date_uniq" ON "attendance" USING btree ("site_id","worker_id","attendance_date") WHERE "attendance"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "worker_advances_site_idx" ON "worker_advances" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "worker_advances_worker_idx" ON "worker_advances" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "worker_advances_date_idx" ON "worker_advances" USING btree ("advance_date");--> statement-breakpoint
CREATE INDEX "worker_advances_run_idx" ON "worker_advances" USING btree ("settled_in_run_id");--> statement-breakpoint
CREATE INDEX "salary_runs_site_idx" ON "salary_runs" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_runs_site_period_uniq" ON "salary_runs" USING btree ("site_id","period_start","period_end") WHERE "salary_runs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "salary_run_items_run_idx" ON "salary_run_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "salary_run_items_site_idx" ON "salary_run_items" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "salary_run_items_worker_idx" ON "salary_run_items" USING btree ("worker_id");