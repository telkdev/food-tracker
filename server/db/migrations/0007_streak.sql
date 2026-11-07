-- Day streak carried over from another app (e.g. FatSecret). Not diary entries: stats stay honest.
ALTER TABLE "settings" ADD COLUMN "streak_carry_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "streak_carry_until" date;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_streak_carry_range" CHECK ("settings"."streak_carry_days" between 0 and 3650);
