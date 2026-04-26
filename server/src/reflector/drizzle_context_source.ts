/**
 * Drizzle-backed ReflectionContextSource (M2 Group 2 follow-up).
 *
 * Pulls recent agent outputs from a BehavioralRecordsStore (#1b's
 * DrizzleBehavioralRecordsStore is the production implementation) and
 * the active issue's title + description from the issues table. Both
 * paths degrade gracefully — if the records store throws or the issue
 * row is missing, the corresponding context fields are simply absent.
 */

import { eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { issues } from "@petagent/db";
import type { BehavioralRecordsStore } from "@petagent/psychologist";
import type { ReflectionContext, ReflectionContextSource } from "@petagent/reflector";

const DEFAULT_OUTPUT_DEPTH = 5;

export interface DrizzleReflectionContextSourceDeps {
  db: Db;
  records: BehavioralRecordsStore;
  outputDepth?: number;
}

export class DrizzleReflectionContextSource implements ReflectionContextSource {
  private readonly db: Db;
  private readonly records: BehavioralRecordsStore;
  private readonly outputDepth: number;

  constructor(deps: DrizzleReflectionContextSourceDeps) {
    this.db = deps.db;
    this.records = deps.records;
    this.outputDepth = deps.outputDepth ?? DEFAULT_OUTPUT_DEPTH;
  }

  async fetchContext(args: { agentId: string; issueId?: string }): Promise<ReflectionContext> {
    const recentOutputs = await this.fetchRecentOutputs(args.agentId);
    const issueCtx = args.issueId ? await this.fetchIssueContext(args.issueId) : null;
    const out: ReflectionContext = { recentOutputs };
    if (issueCtx?.title) out.issueTitle = issueCtx.title;
    if (issueCtx?.description) out.issueDescription = issueCtx.description;
    return out;
  }

  private async fetchRecentOutputs(agentId: string): Promise<string[]> {
    try {
      const samples = await this.records.recentOutputs(agentId, this.outputDepth);
      return samples.map((s) => s.text).filter((t) => t.length > 0);
    } catch {
      return [];
    }
  }

  private async fetchIssueContext(
    issueId: string,
  ): Promise<{ title: string; description: string | null } | null> {
    try {
      const rows = await this.db
        .select({ title: issues.title, description: issues.description })
        .from(issues)
        .where(eq(issues.id, issueId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { title: row.title, description: row.description };
    } catch {
      return null;
    }
  }
}
