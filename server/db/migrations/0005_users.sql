-- Multi-user: every row belongs to a user. Existing data belongs to "owner" (the NUXT_APP_PASSWORD user).
-- Columns get a temporary default for the backfill, then the default is dropped so new rows must name their user.
ALTER TABLE "products" ADD COLUMN "user_id" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_barcode_unique";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_barcode_unique" UNIQUE("user_id","barcode");--> statement-breakpoint

ALTER TABLE "entries" ADD COLUMN "user_id" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
DROP INDEX "entries_date_idx";--> statement-breakpoint
CREATE INDEX "entries_user_date_idx" ON "entries" USING btree ("user_id","date");--> statement-breakpoint

ALTER TABLE "settings" DROP CONSTRAINT "settings_single_row";--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY("user_id");--> statement-breakpoint

ALTER TABLE "preferences" DROP CONSTRAINT "preferences_pkey";--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "user_id" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "preferences" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_pkey" PRIMARY KEY("user_id","key");--> statement-breakpoint

ALTER TABLE "saved_meals" ADD COLUMN "user_id" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "saved_meals" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "saved_meals_user_idx" ON "saved_meals" USING btree ("user_id");--> statement-breakpoint

ALTER TABLE "oauth_codes" ADD COLUMN "user_id" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "oauth_codes" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN "user_id" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "oauth_tokens" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "mcp_calls" ADD COLUMN "user_id" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "mcp_calls" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
DROP INDEX "mcp_calls_at_idx";--> statement-breakpoint
CREATE INDEX "mcp_calls_user_at_idx" ON "mcp_calls" USING btree ("user_id","at");
