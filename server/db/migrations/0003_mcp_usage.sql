CREATE TABLE "mcp_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"tool" text NOT NULL,
	"ok" boolean NOT NULL,
	"in_chars" integer NOT NULL,
	"out_chars" integer NOT NULL,
	"in_tokens" integer NOT NULL,
	"out_tokens" integer NOT NULL,
	"ms" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mcp_calls_at_idx" ON "mcp_calls" USING btree ("at");