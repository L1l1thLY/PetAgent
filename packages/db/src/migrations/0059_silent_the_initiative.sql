ALTER TABLE "agent_notes" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "agent_notes" ADD COLUMN "scope" text DEFAULT 'project' NOT NULL;
--> statement-breakpoint
CREATE INDEX "agent_notes_embedding_idx" ON "agent_notes" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);