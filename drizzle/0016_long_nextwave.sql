CREATE TABLE "bix_conversations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"owner_id" text,
	"phone" text NOT NULL,
	"business_name" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"interest" integer,
	"answers" jsonb,
	"assigned_user_id" text,
	"assigned_name" text,
	"handed_off_at" timestamp with time zone,
	"chat_notified_at" timestamp with time zone,
	"chat_error" text,
	"last_error" text,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bix_messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"wa_id" text,
	"stage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "bix_ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "bix_ready_by" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "bix_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "chat_webhook_enc" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "receives_leads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_lead_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bix_conversations" ADD CONSTRAINT "bix_conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bix_conversations" ADD CONSTRAINT "bix_conversations_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bix_messages" ADD CONSTRAINT "bix_messages_conversation_id_bix_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."bix_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bix_conv_org_idx" ON "bix_conversations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "bix_conv_phone_idx" ON "bix_conversations" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "bix_conv_prospect_idx" ON "bix_conversations" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "bix_msg_conv_idx" ON "bix_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bix_msg_wa_uq" ON "bix_messages" USING btree ("wa_id");