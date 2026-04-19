CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "agent_issue_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"role" text NOT NULL,
	"state" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone,
	"summary" text,
	"transcript_ref" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"issue_id" uuid,
	"session_id" uuid,
	"note_type" text NOT NULL,
	"body" text NOT NULL,
	"tags" text[],
	"metadata" jsonb,
	"git_commit_sha" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_skill_subscriptions" (
	"agent_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_skill_subscriptions_agent_id_skill_id_pk" PRIMARY KEY("agent_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "agent_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"owner_agent_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"git_commit_sha" text,
	"status" text NOT NULL,
	"trial_stats" jsonb,
	"requires_toolsets" text[],
	"fallback_for_toolsets" text[],
	"fallback_for_tools" text[],
	"platforms" text[],
	"last_accessed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "emotional_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"issue_id" uuid,
	"run_id" uuid,
	"detected_at" timestamp with time zone DEFAULT now(),
	"signal_type" text NOT NULL,
	"classification" text,
	"confidence" real,
	"signal_payload" jsonb,
	"intervention_kind" text,
	"intervention_payload" jsonb,
	"dispatched_at" timestamp with time zone,
	"outcome" text,
	"outcome_notes" text,
	"outcome_resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "petagent_plugin_kpi" (
	"plugin_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"value" real NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "petagent_plugin_kpi_plugin_id_metric_key_window_start_pk" PRIMARY KEY("plugin_id","metric_key","window_start")
);
--> statement-breakpoint
CREATE TABLE "petagent_plugin_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_id" uuid NOT NULL,
	"route_type" text NOT NULL,
	"pattern" text NOT NULL,
	"handler" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "petagent_plugins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"source" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now(),
	"last_loaded_at" timestamp with time zone,
	"load_error" text
);
--> statement-breakpoint
ALTER TABLE "agent_issue_sessions" ADD CONSTRAINT "agent_issue_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_notes" ADD CONSTRAINT "agent_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skill_subscriptions" ADD CONSTRAINT "agent_skill_subscriptions_skill_id_agent_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emotional_incidents" ADD CONSTRAINT "emotional_incidents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petagent_plugin_kpi" ADD CONSTRAINT "petagent_plugin_kpi_plugin_id_petagent_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."petagent_plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petagent_plugin_routes" ADD CONSTRAINT "petagent_plugin_routes_plugin_id_petagent_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."petagent_plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petagent_plugins" ADD CONSTRAINT "petagent_plugins_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_issue_sessions_company_idx" ON "agent_issue_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_issue_sessions_issue_idx" ON "agent_issue_sessions" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "agent_issue_sessions_agent_idx" ON "agent_issue_sessions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_notes_company_idx" ON "agent_notes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_notes_agent_idx" ON "agent_notes" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_notes_issue_idx" ON "agent_notes" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "agent_skills_company_idx" ON "agent_skills" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_skills_status_idx" ON "agent_skills" USING btree ("status");--> statement-breakpoint
CREATE INDEX "emotional_incidents_company_idx" ON "emotional_incidents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "emotional_incidents_agent_idx" ON "emotional_incidents" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "emotional_incidents_issue_idx" ON "emotional_incidents" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "petagent_plugin_routes_plugin_idx" ON "petagent_plugin_routes" USING btree ("plugin_id");--> statement-breakpoint
CREATE INDEX "petagent_plugin_routes_type_idx" ON "petagent_plugin_routes" USING btree ("route_type");--> statement-breakpoint
CREATE INDEX "petagent_plugins_company_idx" ON "petagent_plugins" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "petagent_plugins_name_idx" ON "petagent_plugins" USING btree ("name");