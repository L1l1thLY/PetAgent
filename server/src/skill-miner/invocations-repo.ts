/**
 * SkillInvocationsRepo — record-level CRUD for the skill_invocations
 * table (M2 G4 Phase H Shadow Mode foundation).
 *
 * Two write paths:
 *   - recordExposure: called when a skill is included in an agent's
 *     prompt (the "skill seen" event). Sets exposureType (production
 *     for active skills, shadow for trial skills) and snapshots
 *     skillStatus so KPI math survives later status flips.
 *   - markOutcome: called when the underlying run completes (success /
 *     failure). Updates the matching invocations to attribute the
 *     outcome.
 *
 * The actual upstream wiring (agent prompt assembly + heartbeat run
 * completion) is intentionally NOT in this commit — that's the
 * Phase H-2 / "skills-as-prompt-augmentation" feature. Here we ship
 * the foundation so Phase I (KPI comparator) has a typed surface to
 * read against, and tests / migrations can seed data.
 */

import { and, count, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@petagent/db";
import {
  skillInvocations,
  type SkillInvocationRow,
} from "@petagent/db";

export type ExposureType = "production" | "shadow";
export type OutcomeStatus = "success" | "failure" | "unknown";

export interface RecordExposureArgs {
  companyId: string;
  agentId: string;
  skillId: string;
  exposureType: ExposureType;
  skillStatus: string;
  runId?: string | null;
  sessionId?: string | null;
  issueId?: string | null;
}

export interface MarkOutcomeArgs {
  runId: string;
  outcomeStatus: OutcomeStatus;
  outcomeNotes?: string | null;
}

export interface SkillKpiSnapshot {
  skillId: string;
  totalInvocations: number;
  successCount: number;
  failureCount: number;
  unknownCount: number;
  successRate: number;
}

export class SkillInvocationsRepo {
  constructor(private readonly db: Db) {}

  async recordExposure(args: RecordExposureArgs): Promise<SkillInvocationRow> {
    const [row] = await this.db
      .insert(skillInvocations)
      .values({
        companyId: args.companyId,
        agentId: args.agentId,
        skillId: args.skillId,
        exposureType: args.exposureType,
        skillStatus: args.skillStatus,
        runId: args.runId ?? null,
        sessionId: args.sessionId ?? null,
        issueId: args.issueId ?? null,
      })
      .returning();
    return row;
  }

  async markOutcome(args: MarkOutcomeArgs): Promise<number> {
    const result = await this.db
      .update(skillInvocations)
      .set({
        outcomeStatus: args.outcomeStatus,
        outcomeNotes: args.outcomeNotes ?? null,
        outcomeKnownAt: new Date(),
      })
      .where(
        and(
          eq(skillInvocations.runId, args.runId),
          // Don't double-write if already marked.
          sql`${skillInvocations.outcomeStatus} IS NULL`,
        ),
      )
      .returning({ id: skillInvocations.id });
    return result.length;
  }

  async listForSkill(
    skillId: string,
    opts: { since?: Date; limit?: number } = {},
  ): Promise<SkillInvocationRow[]> {
    const conditions = [eq(skillInvocations.skillId, skillId)];
    if (opts.since) {
      conditions.push(gte(skillInvocations.createdAt, opts.since));
    }
    return this.db
      .select()
      .from(skillInvocations)
      .where(and(...conditions))
      .limit(opts.limit ?? 500);
  }

  /**
   * Per-skill KPI rollup since `since` (default: 30 days ago).
   * Excludes invocations with a null outcomeStatus from the
   * success-rate denominator — only counted invocations contribute.
   */
  async kpiForSkill(
    skillId: string,
    since: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  ): Promise<SkillKpiSnapshot> {
    const rows = await this.db
      .select({
        outcomeStatus: skillInvocations.outcomeStatus,
        n: count(),
      })
      .from(skillInvocations)
      .where(
        and(
          eq(skillInvocations.skillId, skillId),
          gte(skillInvocations.createdAt, since),
        ),
      )
      .groupBy(skillInvocations.outcomeStatus);

    let success = 0;
    let failure = 0;
    let unknown = 0;
    for (const r of rows) {
      const n = Number(r.n);
      if (r.outcomeStatus === "success") success = n;
      else if (r.outcomeStatus === "failure") failure = n;
      else unknown += n; // null OR "unknown" both bucket here
    }
    const counted = success + failure;
    const total = counted + unknown;
    return {
      skillId,
      totalInvocations: total,
      successCount: success,
      failureCount: failure,
      unknownCount: unknown,
      successRate: counted === 0 ? 0 : success / counted,
    };
  }
}
