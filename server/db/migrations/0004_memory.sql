CREATE TABLE "preferences" (
	"key" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_key_slug" CHECK ("preferences"."key" ~ '^[a-z0-9_]{1,40}$')
);
--> statement-breakpoint
CREATE TABLE "saved_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_meal" "meal",
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "saved_meals_name_lower_idx" ON "saved_meals" USING btree (lower("name"));--> statement-breakpoint
-- Vasyl's standing rules (2026-11-07). Idempotent; he can edit them in Settings or via set_preference.
INSERT INTO "preferences" ("key", "text") VALUES
  ('weighing', 'All grams are weighed ready to eat: rice, buckwheat, pasta, oats and other grains cooked; meat and fish cooked. Use per-100 g values for the cooked food and say "cooked" in the name. Only packaged products eaten as sold (yogurt, bread, cheese) use their label values.'),
  ('oil_and_sauce', 'For any cooked or dressed dish, if the user did not say, ask whether oil, butter or a sauce was used and how much. Log each as its own entry in the same meal (e.g. "olive oil" 5 g), never fold it into the dish.')
ON CONFLICT ("key") DO NOTHING;
