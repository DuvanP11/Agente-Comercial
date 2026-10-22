ALTER TABLE "campaigns" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "owner_id" text;--> statement-breakpoint
CREATE INDEX "prospects_owner_idx" ON "prospects" USING btree ("owner_id");