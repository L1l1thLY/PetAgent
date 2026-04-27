CREATE TABLE "skill_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"exposure_type" text NOT NULL,
	"skill_status" text NOT NULL,
	"run_id" uuid,
	"session_id" uuid,
	"issue_id" uuid,
	"outcome_status" text,
	"outcome_notes" text,
	"outcome_known_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_invocations" ADD CONSTRAINT "skill_invocations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_invocations" ADD CONSTRAINT "skill_invocations_skill_id_agent_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_invocations_skill_created_idx" ON "skill_invocations" USING btree ("skill_id","created_at");--> statement-breakpoint
CREATE INDEX "skill_invocations_company_created_idx" ON "skill_invocations" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "skill_invocations_run_idx" ON "skill_invocations" USING btree ("run_id");