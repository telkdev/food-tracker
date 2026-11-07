CREATE TYPE "public"."entry_source" AS ENUM('label', 'off', 'generic', 'estimate', 'lifesum');--> statement-breakpoint
CREATE TYPE "public"."meal" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."product_source" AS ENUM('label', 'off', 'generic', 'estimate');--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"meal" "meal" NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"grams" numeric(7, 1) NOT NULL,
	"kcal100" numeric(6, 2) NOT NULL,
	"p100" numeric(6, 2) NOT NULL,
	"f100" numeric(6, 2) NOT NULL,
	"c100" numeric(6, 2) NOT NULL,
	"kcal" numeric(9, 2) GENERATED ALWAYS AS (round(grams * kcal100 / 100, 2)) STORED,
	"p" numeric(9, 2) GENERATED ALWAYS AS (round(grams * p100 / 100, 2)) STORED,
	"f" numeric(9, 2) GENERATED ALWAYS AS (round(grams * f100 / 100, 2)) STORED,
	"c" numeric(9, 2) GENERATED ALWAYS AS (round(grams * c100 / 100, 2)) STORED,
	"source" "entry_source" NOT NULL,
	"note" text,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_kcal100_range" CHECK ("entries"."kcal100" >= 0 and "entries"."kcal100" <= 950),
	CONSTRAINT "entries_macros_nonneg" CHECK ("entries"."p100" >= 0 and "entries"."f100" >= 0 and "entries"."c100" >= 0),
	CONSTRAINT "entries_macros_sum" CHECK ("entries"."p100" + "entries"."f100" + "entries"."c100" <= 105),
	CONSTRAINT "entries_grams_positive" CHECK ("entries"."grams" > 0 and "entries"."grams" <= 5000)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"barcode" text,
	"kcal100" numeric(6, 2) NOT NULL,
	"p100" numeric(6, 2) NOT NULL,
	"f100" numeric(6, 2) NOT NULL,
	"c100" numeric(6, 2) NOT NULL,
	"source" "product_source" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "products_kcal100_range" CHECK ("products"."kcal100" >= 0 and "products"."kcal100" <= 950),
	CONSTRAINT "products_macros_nonneg" CHECK ("products"."p100" >= 0 and "products"."f100" >= 0 and "products"."c100" >= 0),
	CONSTRAINT "products_macros_sum" CHECK ("products"."p100" + "products"."f100" + "products"."c100" <= 105),
	CONSTRAINT "products_barcode_digits" CHECK ("products"."barcode" ~ '^[0-9]{8,14}$')
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"kcal_goal" integer DEFAULT 2500 NOT NULL,
	"p_goal" integer,
	"f_goal" integer,
	"c_goal" integer,
	"timezone" text DEFAULT 'Europe/Warsaw' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_kcal_goal_range" CHECK ("settings"."kcal_goal" between 800 and 8000)
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_date_idx" ON "entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "entries_product_idx" ON "entries" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_name_lower_idx" ON "products" USING btree (lower("name"));