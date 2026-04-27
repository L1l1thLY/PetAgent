/**
 * skill_invocations — every time a skill was exposed to an agent run
 * (M2 G4 Phase H Shadow Mode foundation).
 *
 * Each row says: "skill X was presented to agent Y on run Z, and
 * here's what happened." Phase I's KPI comparator queries this table
 * to compute trial-vs-production success rates and trigger auto-
 * rollback when a trial skill underperforms.
 *
 * exposureType vs skillStatus:
 *   - exposureType is the routing decision ("production" = active
 *     skill served as canonical guidance; "shadow" = trial skill served
 *     for evaluation alongside production)
 *   - skillStatus is a SNAPSHOT of the skill's status at invocation
 *     time, so KPI math survives later status flips (e.g. a skill that
 *     was 'trial' when invoked but later 'retired' still attributes
 *     correctly)
 *
 * outcomeStatus is filled in after the run completes; null until then.
 *
 * No FK on agentId / runId / sessionId / issueId — those tables live
 * in the Paperclip side of the schema and we don't want a cascading
 * delete to wipe analytics data when a run is cleaned up.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agentSkills } from "./agent_skills.js";

export const skillInvocations = pgTable(
  "skill_invocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => agentSkills.id, { onDelete: "cascade" }),

    exposureType: text("exposure_type").notNull(),
    skillStatus: text("skill_status").notNull(),

    runId: uuid("run_id"),
    sessionId: uuid("session_id"),
    issueId: uuid("issue_id"),

    outcomeStatus: text("outcome_status"),
    outcomeNotes: text("outcome_notes"),
    outcomeKnownAt: timestamp("outcome_known_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    skillCreatedIdx: index("skill_invocations_skill_created_idx").on(
      table.skillId,
      table.createdAt,
    ),
    companyCreatedIdx: index("skill_invocations_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    runIdx: index("skill_invocations_run_idx").on(table.runId),
  }),
);

export type SkillInvocationRow = typeof skillInvocations.$inferSelect;
export type SkillInvocationInsert = typeof skillInvocations.$inferInsert;
