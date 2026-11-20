-- Diary access granted by the diary's owner (replaces symmetric "connections").
-- One row per (owner, grantee). status 'requested' = the grantee asked and the owner hasn't answered yet.
-- Any active row lets the grantee see the owner's diary; can_log adds food/water; can_edit edits/deletes any entry
-- (without it a grantee can still fix entries they logged themselves).
CREATE TABLE "diary_access" (
	"owner_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"grantee_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"status" text DEFAULT 'active' NOT NULL,
	"can_log" boolean DEFAULT true NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_access_pkey" PRIMARY KEY("owner_id","grantee_id"),
	CONSTRAINT "diary_access_not_self" CHECK ("owner_id" <> "grantee_id"),
	CONSTRAINT "diary_access_status" CHECK ("status" in ('active', 'requested'))
);--> statement-breakpoint
CREATE INDEX "diary_access_grantee_idx" ON "diary_access" USING btree ("grantee_id");--> statement-breakpoint
-- existing connections (owner <-> nadia) become full access both ways, as they work today
INSERT INTO "diary_access" ("owner_id", "grantee_id", "can_log", "can_edit")
SELECT "user_a", "user_b", true, true FROM "connections"
UNION ALL
SELECT "user_b", "user_a", true, true FROM "connections"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP TABLE "connections";
