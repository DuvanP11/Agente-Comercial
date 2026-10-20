CREATE TABLE "activities" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"prospect_id" text,
	"type" text NOT NULL,
	"detail" jsonb,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text,
	"actor" text,
	"action" text NOT NULL,
	"entity" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"legal_name" text,
	"nit" text,
	"website" text,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"commercial_status" text,
	"account_owner" text,
	"last_contact_at" timestamp with time zone,
	"name_key" text DEFAULT '' NOT NULL,
	"nit_key" text DEFAULT '' NOT NULL,
	"domain_key" text DEFAULT '' NOT NULL,
	"phone_key" text DEFAULT '' NOT NULL,
	"email_key" text DEFAULT '' NOT NULL,
	"import_batch_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_reviews" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"level" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"observed_value" text NOT NULL,
	"source_ref" text NOT NULL,
	"source_name" text NOT NULL,
	"method" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"verification" text NOT NULL,
	"limitations" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"metric" text NOT NULL,
	"scope" text DEFAULT 'org' NOT NULL,
	"scope_value" text,
	"target" numeric(18, 2) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"channel" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"provider_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"search_id" text,
	"name" text NOT NULL,
	"category" text,
	"website" text,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"source_name" text NOT NULL,
	"source_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"name_key" text DEFAULT '' NOT NULL,
	"domain_key" text DEFAULT '' NOT NULL,
	"phone_key" text DEFAULT '' NOT NULL,
	"email_key" text DEFAULT '' NOT NULL,
	"score_json" jsonb,
	"consulted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"natural_language" text,
	"criteria" jsonb NOT NULL,
	"connector" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"result_count" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "theme_settings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"tokens" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_settings" ADD CONSTRAINT "theme_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "clients_nit_idx" ON "clients" USING btree ("org_id","nit_key");--> statement-breakpoint
CREATE INDEX "clients_domain_idx" ON "clients" USING btree ("org_id","domain_key");--> statement-breakpoint
CREATE INDEX "clients_phone_idx" ON "clients" USING btree ("org_id","phone_key");--> statement-breakpoint
CREATE INDEX "dup_prospect_idx" ON "duplicate_reviews" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "evidence_entity_idx" ON "evidence" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "prospects_org_idx" ON "prospects" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prospects_source_uq" ON "prospects" USING btree ("org_id","source_name","source_id");