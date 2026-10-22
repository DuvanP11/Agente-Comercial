ALTER TABLE "org_settings" ADD COLUMN "contact_rules" jsonb;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "contact_outcome" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "contact_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "outcome_note" text;
--> statement-breakpoint
UPDATE "prospects" p SET "contact_attempts" = a.n, "last_attempt_at" = a.last_at, "contact_outcome" = 'contacted'
FROM (SELECT "prospect_id", count(*)::int AS n, max("created_at") AS last_at FROM "activities" WHERE "type" = 'whatsapp_opened' AND "prospect_id" IS NOT NULL GROUP BY "prospect_id") a
WHERE a."prospect_id" = p."id";
