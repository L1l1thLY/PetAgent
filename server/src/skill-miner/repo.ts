/**
 * Drizzle repo for the skill_candidates table (M2 G4 §5.2).
 *
 * Read-write surface used by:
 *   - SkillMiner runner (insert during weekly batch + manual run-now)
 *   - skill-candidates routes (list, approve, reject)
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { skillCandidates, type SkillCandidateRow } from "@petagent/db";

export type CandidateStatus = "pending" | "approved" | "rejected" | "promoted";

export interface InsertCandidateArgs {
  companyId: string;
  agentId: string | null;
  name: string;
  title: string;
  body: string;
  rationale: string;
  sourceNoteIds: string[];
  patternFrequency: number;
  llmModel: string | null;
  llmProviderId: string | null;
  miningRunId: string;
  windowStart: Date;
  windowEnd: Date;
}

export class SkillCandidatesRepo {
  constructor(private readonly db: Db) {}

  async insertMany(rows: InsertCandidateArgs[]): Promise<SkillCandidateRow[]> {
    if (rows.length === 0) return [];
    const inserted = await this.db
      .insert(skillCandidates)
      .values(
        rows.map((r) => ({
          companyId: r.companyId,
          agentId: r.agentId,
          status: "pending" as const,
          name: r.name,
          title: r.title,
          body: r.body,
          rationale: r.rationale,
          sourceNoteIds: r.sourceNoteIds,
          patternFrequency: r.patternFrequency,
          llmModel: r.llmModel,
          llmProviderId: r.llmProviderId,
          miningRunId: r.miningRunId,
          windowStart: r.windowStart,
          windowEnd: r.windowEnd,
        })),
      )
      .returning();
    return inserted;
  }

  async listByCompany(args: {
    companyId: string;
    status?: CandidateStatus;
    limit?: number;
  }): Promise<SkillCandidateRow[]> {
    const conditions = [eq(skillCandidates.companyId, args.companyId)];
    if (args.status !== undefined) {
      conditions.push(eq(skillCandidates.status, args.status));
    }
    return this.db
      .select()
      .from(skillCandidates)
      .where(and(...conditions))
      .orderBy(desc(skillCandidates.createdAt))
      .limit(args.limit ?? 200);
  }

  async findById(id: string): Promise<SkillCandidateRow | null> {
    const rows = await this.db
      .select()
      .from(skillCandidates)
      .where(eq(skillCandidates.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async setStatus(args: {
    id: string;
    status: CandidateStatus;
    reviewedByActorId: string | null;
    promotedSkillName?: string | null;
  }): Promise<SkillCandidateRow | null> {
    const update: Partial<SkillCandidateRow> = {
      status: args.status,
      reviewedAt: new Date(),
      reviewedByActorId: args.reviewedByActorId,
    };
    if (args.promotedSkillName !== undefined) {
      update.promotedSkillName = args.promotedSkillName;
    }
    const updated = await this.db
      .update(skillCandidates)
      .set(update)
      .where(eq(skillCandidates.id, args.id))
      .returning();
    return updated[0] ?? null;
  }

  async countPending(companyId: string): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(skillCandidates)
      .where(
        and(
          eq(skillCandidates.companyId, companyId),
          eq(skillCandidates.status, "pending"),
        ),
      );
    return rows[0]?.n ?? 0;
  }
}
