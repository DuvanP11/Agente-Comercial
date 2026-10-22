UPDATE "users" SET "role" = 'hunter' WHERE "role" = 'user';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'hunter';
