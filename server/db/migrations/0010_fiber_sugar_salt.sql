-- Fiber, sugars and salt per 100 g (nullable: unknown for old entries and most estimates) + entry totals.
-- Purely additive. The generated columns rewrite "entries" once (small table).
ALTER TABLE "products" ADD COLUMN "fiber100" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sugar100" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "salt100" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_extras_range" CHECK (coalesce("products"."fiber100", 0) between 0 and 100 and coalesce("products"."sugar100", 0) between 0 and 100 and coalesce("products"."salt100", 0) between 0 and 100);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sugar_in_carbs" CHECK ("products"."sugar100" is null or "products"."sugar100" <= "products"."c100" + 1);--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "fiber100" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "sugar100" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "salt100" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "fiber" numeric(9, 2) GENERATED ALWAYS AS (round(grams * fiber100 / 100, 2)) STORED;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "sugar" numeric(9, 2) GENERATED ALWAYS AS (round(grams * sugar100 / 100, 2)) STORED;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "salt" numeric(9, 3) GENERATED ALWAYS AS (round(grams * salt100 / 100, 3)) STORED;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_extras_range" CHECK (coalesce("entries"."fiber100", 0) between 0 and 100 and coalesce("entries"."sugar100", 0) between 0 and 100 and coalesce("entries"."salt100", 0) between 0 and 100);--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_sugar_in_carbs" CHECK ("entries"."sugar100" is null or "entries"."sugar100" <= "entries"."c100" + 1);
