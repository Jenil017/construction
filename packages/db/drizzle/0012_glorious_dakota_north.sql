ALTER TABLE "dpr" ALTER COLUMN "status" SET DEFAULT 'submitted';--> statement-breakpoint
-- Drop the draft stage: existing draft reports become submitted (visible to everyone with DPR access).
UPDATE "dpr" SET "status" = 'submitted' WHERE "status" = 'draft';