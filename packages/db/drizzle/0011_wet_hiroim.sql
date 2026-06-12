CREATE TABLE "worker_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "salary_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"period_month" varchar(7) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_date" date NOT NULL,
	"payment_mode" varchar(40),
	"note" varchar(200),
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "worker_categories" ADD CONSTRAINT "worker_categories_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worker_categories_site_idx" ON "worker_categories" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_categories_site_name_uniq" ON "worker_categories" USING btree ("site_id","name") WHERE "worker_categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "salary_payments_site_idx" ON "salary_payments" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "salary_payments_worker_idx" ON "salary_payments" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "salary_payments_period_idx" ON "salary_payments" USING btree ("site_id","period_month");--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_category_id_worker_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."worker_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workers_category_idx" ON "workers" USING btree ("category_id");