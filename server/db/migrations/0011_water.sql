-- Water tracking. Purely additive: one nullable settings column and a new table.
ALTER TABLE "settings" ADD COLUMN "water_goal_ml" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_water_goal" CHECK ("settings"."water_goal_ml" between 500 and 6000);--> statement-breakpoint
CREATE TABLE "water" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"ml" integer NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "water_ml_range" CHECK ("water"."ml" between 1 and 3000)
);--> statement-breakpoint
CREATE INDEX "water_user_date_idx" ON "water" USING btree ("user_id","date");
