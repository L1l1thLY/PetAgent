import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const agentSkills = pgTable(
  "agent_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    ownerAgentId: uuid("owner_agent_id"),
    name: text("name").notNull(),
    description: text("description"),
    content: text("content").notNull(),
    gitCommitSha: text("git_commit_sha"),
    status: text("status").notNull(),
    trialStats: jsonb("trial_stats").$type<Record<string, unknown>>(),
    requiresToolsets: text("requires_toolsets").array(),
    fallbackForToolsets: text("fallback_for_toolsets").array(),
    fallbackForTools: text("fallback_for_tools").array(),
    platforms: text("platforms").array(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    companyIdx: index("agent_skills_company_idx").on(table.companyId),
    statusIdx: index("agent_skills_status_idx").on(table.status),
  }),
);

export const agentSkillSubscriptions = pgTable(
  "agent_skill_subscriptions",
  {
    agentId: uuid("agent_id").notNull(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => agentSkills.id, { onDelete: "cascade" }),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.skillId] }),
  }),
);
