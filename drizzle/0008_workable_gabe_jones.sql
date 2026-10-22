CREATE TABLE "campaign_attachments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"kind" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "cover_data" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "cover_mime" text;--> statement-breakpoint
ALTER TABLE "campaign_attachments" ADD CONSTRAINT "campaign_attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_attachments" ADD CONSTRAINT "campaign_attachments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_attachments_idx" ON "campaign_attachments" USING btree ("campaign_id");