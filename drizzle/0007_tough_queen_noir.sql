CREATE TABLE "brand_assets" (
	"org_id" text PRIMARY KEY NOT NULL,
	"logo_data" text,
	"logo_mime" text,
	"icon_data" text,
	"icon_mime" text,
	"tint" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;