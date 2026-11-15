-- Steps / active kcal / workouts from the phone, and a per-user ingest token. Purely additive: two new tables.
CREATE TABLE "activity_samples" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"date" date NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"value" numeric(9, 1) NOT NULL,
	"label" text,
	"origin" text,
	"daily" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_samples_pkey" PRIMARY KEY("user_id","kind","key"),
	CONSTRAINT "activity_samples_kind" CHECK ("activity_samples"."kind" in ('steps', 'active_kcal', 'exercise')),
	CONSTRAINT "activity_samples_value_range" CHECK ("activity_samples"."value" >= 0 and "activity_samples"."value" <= 200000)
);--> statement-breakpoint
CREATE INDEX "activity_samples_user_date_idx" ON "activity_samples" USING btree ("user_id","date");--> statement-breakpoint
CREATE TABLE "ingest_tokens" (
	"user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_client" text,
	CONSTRAINT "ingest_tokens_hash_unique" UNIQUE("token_hash")
);
