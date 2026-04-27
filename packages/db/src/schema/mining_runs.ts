/**
 * mining_runs — one row per SkillMiner cycle (M2 G4 Phase F).
 *
 * Backs the Weekly Digest UI: lets us list "what happened this week"
 * even when a run produced zero candidates. skill_candidates.miningRunId
 * already references the same UUID, so we get full traceability.
 *
 * triggeredBy distinguishes scheduled cron fires from manual
 * Run-Now button presses (and could later identify which actor
 * clicked it).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const miningRuns = pgTable(
  "mining_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    firedAt: timestamp("fired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    notesScanned: integer("notes_scanned").notNull().default(0),
    candidatesCreated: integer("candidates_created").notNull().default(0),
    fellBackToEmpty: boolean("fell_back_to_empty").notNull().default(false),
    skippedReason: text("skipped_reason"),
    llmModel: text("llm_model"),
    llmProviderId: text("llm_provider_id"),
    triggeredBy: text("triggered_by").notNull().default("routine"),
  },
  (table) => ({
    companyFiredIdx: index("mining_runs_company_fired_idx").on(
      table.companyId,
      table.firedAt,
    ),
  }),
);

export type MiningRunRow = typeof miningRuns.$inferSelect;
export type MiningRunInsert = typeof miningRuns.$inferInsert;
