import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const emotionalIncidents = pgTable(
  "emotional_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    issueId: uuid("issue_id"),
    runId: uuid("run_id"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
    signalType: text("signal_type").notNull(),
    classification: text("classification"),
    confidence: real("confidence"),
    signalPayload: jsonb("signal_payload").$type<Record<string, unknown>>(),
    interventionKind: text("intervention_kind"),
    interventionPayload: jsonb("intervention_payload").$type<Record<string, unknown>>(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    outcome: text("outcome"),
    outcomeNotes: text("outcome_notes"),
    outcomeResolvedAt: timestamp("outcome_resolved_at", { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index("emotional_incidents_company_idx").on(table.companyId),
    agentIdx: index("emotional_incidents_agent_idx").on(table.agentId),
    issueIdx: index("emotional_incidents_issue_idx").on(table.issueId),
  }),
);
