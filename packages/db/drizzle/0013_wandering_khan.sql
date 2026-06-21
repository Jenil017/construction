CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"invoice_type" varchar(8) NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"invoice_seq" integer NOT NULL,
	"financial_year" varchar(9) NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"supply_type" varchar(8) DEFAULT 'intra' NOT NULL,
	"place_of_supply" varchar(120),
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"seller_name" varchar(200) NOT NULL,
	"seller_gstin" varchar(15),
	"seller_address" text,
	"seller_state" varchar(120),
	"seller_state_code" varchar(2),
	"buyer_name" varchar(200) NOT NULL,
	"buyer_gstin" varchar(15),
	"buyer_address" text,
	"buyer_state" varchar(120),
	"buyer_state_code" varchar(2),
	"buyer_contact" varchar(60),
	"sub_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(8, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_in_words" text,
	"payment_status" varchar(12) DEFAULT 'unpaid' NOT NULL,
	"amount_received" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_mode" varchar(40),
	"notes" text,
	"status" varchar(12) DEFAULT 'issued' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"material_id" uuid,
	"description" varchar(200) NOT NULL,
	"hsn_code" varchar(10),
	"quantity" numeric(14, 3) NOT NULL,
	"unit" varchar(40),
	"rate" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxable_value" numeric(14, 2) NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cgst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "gstin" varchar(15);--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "state_code" varchar(2);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_site_idx" ON "invoices" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "invoices_site_date_idx" ON "invoices" USING btree ("site_id","invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_payment_status_idx" ON "invoices" USING btree ("payment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("site_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_seq_unique" ON "invoices" USING btree ("site_id","invoice_type","financial_year","invoice_seq");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_items_site_idx" ON "invoice_items" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "invoice_items_material_idx" ON "invoice_items" USING btree ("material_id");