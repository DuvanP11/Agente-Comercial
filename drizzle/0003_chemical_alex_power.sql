CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"agent" text NOT NULL,
	"status" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"input" jsonb,
	"output" jsonb,
	"warnings" jsonb,
	"error" text,
	"model" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"duration_ms" integer,
	"actor" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_org_idx" ON "agent_runs" USING btree ("org_id","started_at");