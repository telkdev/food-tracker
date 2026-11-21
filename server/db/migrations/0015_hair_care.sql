-- Hair care tracker (tab «Волосы»). Purely additive: two new tables, no change to existing ones.
CREATE TABLE "hair_routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"per_week" integer NOT NULL,
	"duration_min" integer,
	"duration_max" integer,
	"note" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_on" date NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hair_routines_per_week" CHECK ("hair_routines"."per_week" between 1 and 7),
	CONSTRAINT "hair_routines_duration" CHECK (("hair_routines"."duration_min" is null or "hair_routines"."duration_min" between 1 and 240) and ("hair_routines"."duration_max" is null or "hair_routines"."duration_max" between 1 and 240)),
	CONSTRAINT "hair_routines_name" CHECK (length("hair_routines"."name") between 1 and 80)
);--> statement-breakpoint
CREATE INDEX "hair_routines_user_idx" ON "hair_routines" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "hair_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"routine_id" uuid NOT NULL REFERENCES "hair_routines"("id") ON DELETE CASCADE,
	"date" date NOT NULL,
	"note" text,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hair_logs_routine_date" UNIQUE("routine_id","date")
);--> statement-breakpoint
CREATE INDEX "hair_logs_user_date_idx" ON "hair_logs" USING btree ("user_id","date");
