/**
 * skill_candidates — proposed skills surfaced by SkillMiner (M2 G4 §5.2).
 *
 * Lifecycle:
 *   pending  → mined by routine, awaiting human review
 *   approved → user OK'd, promotion to a real Skill happens in the same
 *              POST handler (sets promotedSkillName + status=promoted)
 *   rejected → user dismissed
 *   promoted → terminal; promotedSkillName references the live Skill
 *
 * `agentId` is nullable: a candidate can be specific to one agent or
 * pool-wide (when notes from multiple agents converge on the same
 * pattern).
 *
 * `sourceNoteIds` retains traceability — the UI can link back to the
 * Notes that led to the proposal.
 *
 * `miningRunId` groups candidates produced in the same routine fire,
 * making it easy to render "this week's batch" in the digest UI.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const skillCandidates = pgTable(
  "skill_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id"),

    status: text("status").notNull().default("pending"),

    name: text("name").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    rationale: text("rationale"),

    sourceNoteIds: jsonb("source_note_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    patternFrequency: integer("pattern_frequency").notNull().default(0),

    llmModel: text("llm_model"),
    llmProviderId: text("llm_provider_id"),

    miningRunId: uuid("mining_run_id"),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByActorId: uuid("reviewed_by_actor_id"),

    promotedSkillName: text("promoted_skill_name"),
  },
  (table) => ({
    companyStatusIdx: index("skill_candidates_company_status_idx").on(
      table.companyId,
      table.status,
    ),
    miningRunIdx: index("skill_candidates_mining_run_idx").on(table.miningRunId),
    companyCreatedIdx: index("skill_candidates_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
  }),
);

export type SkillCandidateRow = typeof skillCandidates.$inferSelect;
export type SkillCandidateInsert = typeof skillCandidates.$inferInsert;
