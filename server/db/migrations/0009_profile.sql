-- Profile for the Tips tab questionnaire + a body weight log. Purely additive: new nullable columns and a new table.
ALTER TABLE "settings" ADD COLUMN "goal_type" text DEFAULT 'recomp' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "sex" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "activity" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "training_days" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "experience" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "profile_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_goal_type" CHECK ("settings"."goal_type" in ('recomp', 'cut', 'bulk'));--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_sex" CHECK ("settings"."sex" in ('m', 'f'));--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_birth_year" CHECK ("settings"."birth_year" between 1920 and 2015);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_height" CHECK ("settings"."height_cm" between 120 and 230);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_activity" CHECK ("settings"."activity" in ('sitting', 'light', 'active', 'physical'));--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_training_days" CHECK ("settings"."training_days" between 0 and 7);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_experience" CHECK ("settings"."experience" in ('new', 'returning', 'trained'));--> statement-breakpoint
CREATE TABLE "weights" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"kg" numeric(5, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weights_pkey" PRIMARY KEY("user_id","date"),
	CONSTRAINT "weights_kg_range" CHECK ("weights"."kg" between 30 and 300)
);
