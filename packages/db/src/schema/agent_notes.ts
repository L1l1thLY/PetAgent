import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { resolveAgentNoteEmbeddingDims } from "../embedding-dimensions.js";

const agentNoteEmbeddingVector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    // Drizzle reads this while building schema metadata at process start; changing
    // PETAGENT_EMBEDDING_DIMS later in the same runtime will not resize the column.
    return `vector(${resolveAgentNoteEmbeddingDims()})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

export const agentNotes = pgTable(
  "agent_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    issueId: uuid("issue_id"),
    sessionId: uuid("session_id"),
    noteType: text("note_type").notNull(),
    body: text("body").notNull(),
    tags: text("tags").array(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    gitCommitSha: text("git_commit_sha"),
    embedding: agentNoteEmbeddingVector("embedding"),
    scope: text("scope").notNull().default("project"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    companyIdx: index("agent_notes_company_idx").on(table.companyId),
    agentIdx: index("agent_notes_agent_idx").on(table.agentId),
    issueIdx: index("agent_notes_issue_idx").on(table.issueId),
  }),
);

export const agentIssueSessions = pgTable(
  "agent_issue_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    issueId: uuid("issue_id").notNull(),
    role: text("role").notNull(),
    state: text("state").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    summary: text("summary"),
    transcriptRef: text("transcript_ref"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    companyIdx: index("agent_issue_sessions_company_idx").on(table.companyId),
    issueIdx: index("agent_issue_sessions_issue_idx").on(table.issueId),
    agentIdx: index("agent_issue_sessions_agent_idx").on(table.agentId),
  }),
);
