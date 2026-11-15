-- Users move from env (NUXT_APP_PASSWORD / NUXT_USERS) into the database, plus passkeys.
-- Purely additive: no existing row changes. Every user_id already in the data gets a users row with the SAME id,
-- so all diaries, products, meals and Claude connector tokens stay attached. Password hashes are filled from env
-- on the first server start after this migration (server/utils/users.ts, syncEnvUsers), because SQL can't read env.
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"password_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"invite_hash" text,
	"invite_expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_unique" UNIQUE("login"),
	CONSTRAINT "users_invite_hash_unique" UNIQUE("invite_hash"),
	CONSTRAINT "users_login_format" CHECK ("users"."login" ~ '^[a-z0-9_]{1,30}$'),
	CONSTRAINT "users_id_format" CHECK ("users"."id" ~ '^[a-z0-9_]{1,30}$')
);--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text[],
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX "passkeys_user_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "users" ("id", "login", "is_admin") VALUES ('owner', 'owner', true) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "users" ("id", "login")
SELECT DISTINCT u.id, u.id FROM (
	SELECT "user_id" AS id FROM "settings"
	UNION SELECT "user_id" FROM "entries"
	UNION SELECT "user_id" FROM "products"
	UNION SELECT "user_id" FROM "saved_meals"
	UNION SELECT "user_id" FROM "preferences"
	UNION SELECT "user_id" FROM "oauth_tokens"
) u WHERE u.id ~ '^[a-z0-9_]{1,30}$'
ON CONFLICT DO NOTHING;
