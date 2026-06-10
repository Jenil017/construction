ALTER TABLE "site_sales" ALTER COLUMN "buyer_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL;