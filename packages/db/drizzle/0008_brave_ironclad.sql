ALTER TABLE "purchases" ALTER COLUMN "supplier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "seller_name" varchar(160);