/**
 * Weekly Digest aggregator (M2 G4 Phase F).
 *
 * Joins mining_runs + skill_candidates for one ISO week and returns a
 * summary blob the UI renders without further joins.
 */

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { miningRuns, skillCandidates } from "@petagent/db";

export interface DigestRunSummary {
  miningRunId: string;
  firedAt: string;
  windowStart: string;
  windowEnd: string;
  notesScanned: number;
  candidatesCreated: number;
  fellBackToEmpty: boolean;
  skippedReason: string | null;
  triggeredBy: string;
  llmModel: string | null;
  pending: number;
  approved: number;
  rejected: number;
  promoted: number;
}

export interface DigestPromotedSkill {
  candidateId: string;
  name: string;
  title: string;
  promotedSkillName: string | null;
  promotedAt: string | null;
}

export interface DigestResponse {
  weekStart: string;
  weekEnd: string;
  totals: {
    runs: number;
    notesScanned: number;
    candidatesCreated: number;
    pending: number;
    approved: number;
    rejected: number;
    promoted: number;
  };
  runs: DigestRunSummary[];
  topPromoted: DigestPromotedSkill[];
}

/**
 * Resolves a YYYY-Www ISO-week string (e.g. "2026-W17") into a
 * [weekStart, weekEnd) range. Throws on malformed input.
 */
export function isoWeekToRange(iso: string): { weekStart: Date; weekEnd: Date } {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(iso.trim());
  if (m === null) throw new Error(`Invalid ISO week: ${iso}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) throw new Error(`Week ${week} out of range`);

  // ISO 8601: Week 1 is the week containing the first Thursday of the year.
  // Equivalent: Jan 4 always falls in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Sun=0 → 7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const weekStart = new Date(week1Monday);
  weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
  return { weekStart, weekEnd };
}

export function rangeToIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day); // Move to Thursday of this week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export async function buildWeeklyDigest(
  db: Db,
  companyId: string,
  weekStart: Date,
  weekEnd: Date,
  topPromotedLimit = 5,
): Promise<DigestResponse> {
  const runs = await db
    .select()
    .from(miningRuns)
    .where(
      and(
        eq(miningRuns.companyId, companyId),
        gte(miningRuns.firedAt, weekStart),
        lt(miningRuns.firedAt, weekEnd),
      ),
    )
    .orderBy(desc(miningRuns.firedAt));

  const runIds = runs.map((r) => r.id);

  const statusCounts =
    runIds.length > 0
      ? await db
          .select({
            miningRunId: skillCandidates.miningRunId,
            status: skillCandidates.status,
            n: sql<number>`count(*)::int`,
          })
          .from(skillCandidates)
          .where(eq(skillCandidates.companyId, companyId))
          .groupBy(skillCandidates.miningRunId, skillCandidates.status)
      : [];

  const countsByRun = new Map<string, { pending: number; approved: number; rejected: number; promoted: number }>();
  for (const id of runIds) countsByRun.set(id, { pending: 0, approved: 0, rejected: 0, promoted: 0 });
  for (const row of statusCounts) {
    if (row.miningRunId === null) continue;
    const bucket = countsByRun.get(row.miningRunId);
    if (bucket === undefined) continue;
    if (row.status === "pending" || row.status === "approved" || row.status === "rejected" || row.status === "promoted") {
      bucket[row.status] = row.n;
    }
  }

  const runSummaries: DigestRunSummary[] = runs.map((r) => {
    const counts = countsByRun.get(r.id) ?? { pending: 0, approved: 0, rejected: 0, promoted: 0 };
    return {
      miningRunId: r.id,
      firedAt: r.firedAt.toISOString(),
      windowStart: r.windowStart.toISOString(),
      windowEnd: r.windowEnd.toISOString(),
      notesScanned: r.notesScanned,
      candidatesCreated: r.candidatesCreated,
      fellBackToEmpty: r.fellBackToEmpty,
      skippedReason: r.skippedReason,
      triggeredBy: r.triggeredBy,
      llmModel: r.llmModel,
      ...counts,
    };
  });

  const totals = runSummaries.reduce(
    (acc, r) => ({
      runs: acc.runs + 1,
      notesScanned: acc.notesScanned + r.notesScanned,
      candidatesCreated: acc.candidatesCreated + r.candidatesCreated,
      pending: acc.pending + r.pending,
      approved: acc.approved + r.approved,
      rejected: acc.rejected + r.rejected,
      promoted: acc.promoted + r.promoted,
    }),
    { runs: 0, notesScanned: 0, candidatesCreated: 0, pending: 0, approved: 0, rejected: 0, promoted: 0 },
  );

  const promoted =
    runIds.length > 0
      ? await db
          .select({
            id: skillCandidates.id,
            name: skillCandidates.name,
            title: skillCandidates.title,
            promotedSkillName: skillCandidates.promotedSkillName,
            reviewedAt: skillCandidates.reviewedAt,
          })
          .from(skillCandidates)
          .where(
            and(
              eq(skillCandidates.companyId, companyId),
              eq(skillCandidates.status, "promoted"),
              gte(skillCandidates.reviewedAt, weekStart),
              lt(skillCandidates.reviewedAt, weekEnd),
            ),
          )
          .orderBy(desc(skillCandidates.reviewedAt))
          .limit(topPromotedLimit)
      : [];

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    totals,
    runs: runSummaries,
    topPromoted: promoted.map((p) => ({
      candidateId: p.id,
      name: p.name,
      title: p.title,
      promotedSkillName: p.promotedSkillName,
      promotedAt: p.reviewedAt?.toISOString() ?? null,
    })),
  };
}
