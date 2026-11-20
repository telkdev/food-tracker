-- Connected users can log food and water into each other's diary. Additive: one table, two nullable columns.
CREATE TABLE "connections" (
	"user_a" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"user_b" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_pkey" PRIMARY KEY("user_a","user_b"),
	CONSTRAINT "connections_ordered" CHECK ("user_a" < "user_b")
);--> statement-breakpoint
CREATE INDEX "connections_user_b_idx" ON "connections" USING btree ("user_b");--> statement-breakpoint
-- who wrote the row when it differs from user_id (null = the user themselves)
ALTER TABLE "entries" ADD COLUMN "logged_by" text;--> statement-breakpoint
ALTER TABLE "water" ADD COLUMN "logged_by" text;--> statement-breakpoint
-- Vasyl asked (2026-11-20) to connect him and Nadia right away
INSERT INTO "connections" ("user_a", "user_b", "created_by")
SELECT 'nadia', 'owner', 'owner'
WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = 'nadia') AND EXISTS (SELECT 1 FROM "users" WHERE "id" = 'owner')
ON CONFLICT DO NOTHING;
