CREATE TABLE "mining_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"notes_scanned" integer DEFAULT 0 NOT NULL,
	"candidates_created" integer DEFAULT 0 NOT NULL,
	"fell_back_to_empty" boolean DEFAULT false NOT NULL,
	"skipped_reason" text,
	"llm_model" text,
	"llm_provider_id" text,
	"triggered_by" text DEFAULT 'routine' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mining_runs" ADD CONSTRAINT "mining_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mining_runs_company_fired_idx" ON "mining_runs" USING btree ("company_id","fired_at");