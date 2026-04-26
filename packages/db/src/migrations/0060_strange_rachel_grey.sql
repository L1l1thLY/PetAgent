CREATE TABLE "skill_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"rationale" text,
	"source_note_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pattern_frequency" integer DEFAULT 0 NOT NULL,
	"llm_model" text,
	"llm_provider_id" text,
	"mining_run_id" uuid,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_actor_id" uuid,
	"promoted_skill_name" text
);
--> statement-breakpoint
ALTER TABLE "skill_candidates" ADD CONSTRAINT "skill_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_candidates_company_status_idx" ON "skill_candidates" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "skill_candidates_mining_run_idx" ON "skill_candidates" USING btree ("mining_run_id");--> statement-breakpoint
CREATE INDEX "skill_candidates_company_created_idx" ON "skill_candidates" USING btree ("company_id","created_at");