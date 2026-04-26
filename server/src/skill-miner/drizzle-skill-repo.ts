/**
 * Drizzle-backed SkillRepository (M2 G4 MVP — first concrete impl).
 *
 * @petagent/skills defines the SkillRepository port; until now no
 * concrete implementation existed because M1 served skills via the
 * GitStore alone. SkillMiner promotion needs DB persistence so the
 * UI's "skills you have" view can list both newly promoted candidates
 * and skills loaded from disk.
 *
 * Uses the existing agent_skills + agent_skill_subscriptions tables.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agentSkills, agentSkillSubscriptions } from "@petagent/db";
import {
  parseFrontmatter,
  type SkillRecord,
  type SkillRepository,
  type SkillStatus,
} from "@petagent/skills";

export class DrizzleSkillRepository implements SkillRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<SkillRecord | null> {
    const rows = await this.db
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return rowToRecord(row);
  }

  async findByCompany(companyId: string): Promise<SkillRecord[]> {
    const rows = await this.db
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.companyId, companyId));
    return rows.map(rowToRecord);
  }

  async upsert(record: SkillRecord): Promise<SkillRecord> {
    const existing = await this.findById(record.id);
    if (existing === null) {
      await this.db.insert(agentSkills).values({
        id: record.id,
        companyId: record.companyId,
        ownerAgentId: record.ownerAgentId,
        name: record.name,
        description: record.description,
        content: record.content,
        gitCommitSha: record.gitCommitSha,
        status: record.status,
      });
    } else {
      await this.db
        .update(agentSkills)
        .set({
          ownerAgentId: record.ownerAgentId,
          name: record.name,
          description: record.description,
          content: record.content,
          gitCommitSha: record.gitCommitSha,
          status: record.status,
        })
        .where(eq(agentSkills.id, record.id));
    }
    return record;
  }

  async setStatus(id: string, status: SkillStatus): Promise<void> {
    await this.db
      .update(agentSkills)
      .set({ status })
      .where(eq(agentSkills.id, id));
  }

  async subscribe(agentId: string, skillId: string): Promise<void> {
    await this.db
      .insert(agentSkillSubscriptions)
      .values({ agentId, skillId })
      .onConflictDoNothing();
  }

  async unsubscribe(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(agentSkillSubscriptions)
      .where(
        and(
          eq(agentSkillSubscriptions.agentId, agentId),
          eq(agentSkillSubscriptions.skillId, skillId),
        ),
      );
  }

  async listSubscriptions(agentId: string): Promise<SkillRecord[]> {
    const rows = await this.db
      .select({
        id: agentSkills.id,
        companyId: agentSkills.companyId,
        ownerAgentId: agentSkills.ownerAgentId,
        name: agentSkills.name,
        description: agentSkills.description,
        content: agentSkills.content,
        gitCommitSha: agentSkills.gitCommitSha,
        status: agentSkills.status,
      })
      .from(agentSkillSubscriptions)
      .innerJoin(agentSkills, eq(agentSkillSubscriptions.skillId, agentSkills.id))
      .where(eq(agentSkillSubscriptions.agentId, agentId));
    return rows.map((r) => rowToRecord(r));
  }
}

function rowToRecord(row: {
  id: string;
  companyId: string;
  ownerAgentId: string | null;
  name: string;
  description: string | null;
  content: string;
  gitCommitSha: string | null;
  status: string;
}): SkillRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    ownerAgentId: row.ownerAgentId,
    name: row.name,
    description: row.description,
    content: row.content,
    gitCommitSha: row.gitCommitSha,
    status: (row.status as SkillStatus) ?? "trial",
    parsed: parseFrontmatter(row.content),
  };
}
