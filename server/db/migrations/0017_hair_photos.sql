-- Hair progress photos (tab «Волосы»). Purely additive: one new table, nothing else touched.
-- Images live in Postgres because Render's disk is ephemeral; the browser shrinks them first (~250 KB each).
CREATE TABLE "hair_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"taken_on" date NOT NULL,
	"note" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"image" bytea NOT NULL,
	"thumb" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hair_photos_size" CHECK (octet_length("hair_photos"."image") <= 1048576 and octet_length("hair_photos"."thumb") <= 131072),
	CONSTRAINT "hair_photos_dims" CHECK ("hair_photos"."width" between 1 and 4096 and "hair_photos"."height" between 1 and 4096),
	CONSTRAINT "hair_photos_note" CHECK ("hair_photos"."note" is null or length("hair_photos"."note") <= 300)
);--> statement-breakpoint
CREATE INDEX "hair_photos_user_idx" ON "hair_photos" USING btree ("user_id","taken_on");
