/**
 * SkillMiner runner — orchestrates one mining cycle (M2 G4 §5.2).
 *
 * Steps:
 *   1. Read agent_notes for this company within the window
 *   2. Call mineSkills() with the configured LLMTextTransport
 *   3. Persist resulting candidates with miningRunId + window metadata
 *
 * Used by both the weekly setInterval (server boot) and the manual
 * "Run mining now" button (POST /skill-mining/run-now).
 */

import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agentNotes, miningRuns } from "@petagent/db";
import { mineSkills, type NoteSummary } from "@petagent/skill-miner";
import type { LLMTextTransport } from "@petagent/llm-providers";
import { SkillCandidatesRepo } from "./repo.js";

export interface SkillMinerRunnerDeps {
  db: Db;
  /** From LLMRouter.getTextTransport("reflector") for MVP — same provider as Reflector. */
  transportFactory: () => { transport: LLMTextTransport; model: string; providerId: string } | null;
  /** Days of look-back for notes. Default 7. */
  windowDays?: number;
  /** Soft cap on notes per cycle so we don't blow context. Default 200. */
  maxNotes?: number;
  /** Records this in mining_runs.triggered_by. Default "routine". */
  triggeredBy?: string;
  logger?: { info?(msg: string): void; warn?(msg: string, meta?: unknown): void };
}

export interface MineCycleResult {
  miningRunId: string;
  companyId: string;
  notesScanned: number;
  candidatesCreated: number;
  fellBackToEmpty: boolean;
  windowStart: Date;
  windowEnd: Date;
  /** Set when no transport available (e.g. reflector routing not configured). */
  skippedReason?: string;
}

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_MAX_NOTES = 200;

export async function mineForCompany(
  deps: SkillMinerRunnerDeps,
  companyId: string,
): Promise<MineCycleResult> {
  const windowDays = deps.windowDays ?? DEFAULT_WINDOW_DAYS;
  const maxNotes = deps.maxNotes ?? DEFAULT_MAX_NOTES;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // Pre-insert the mining_runs row with placeholder counts so the
  // miningRunId is real before we hand it to skill_candidates rows.
  const [runRow] = await deps.db
    .insert(miningRuns)
    .values({
      companyId,
      windowStart,
      windowEnd,
      notesScanned: 0,
      candidatesCreated: 0,
      fellBackToEmpty: false,
      triggeredBy: deps.triggeredBy ?? "routine",
    })
    .returning({ id: miningRuns.id });
  const miningRunId = runRow.id;

  const notesRows = await deps.db
    .select({
      id: agentNotes.id,
      agentId: agentNotes.agentId,
      noteType: agentNotes.noteType,
      body: agentNotes.body,
      tags: agentNotes.tags,
      createdAt: agentNotes.createdAt,
    })
    .from(agentNotes)
    .where(
      and(
        eq(agentNotes.companyId, companyId),
        gte(agentNotes.createdAt, windowStart),
        lte(agentNotes.createdAt, windowEnd),
      ),
    )
    .orderBy(desc(agentNotes.createdAt))
    .limit(maxNotes);

  const notes: NoteSummary[] = notesRows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    noteType: r.noteType,
    body: r.body,
    tags: r.tags ?? null,
    createdAt: r.createdAt ?? undefined,
  }));

  const transport = deps.transportFactory();
  if (transport === null) {
    const skipReason = "no LLM transport configured for skill mining (reflector routing missing)";
    await deps.db
      .update(miningRuns)
      .set({ notesScanned: notes.length, skippedReason: skipReason })
      .where(eq(miningRuns.id, miningRunId));
    return {
      miningRunId,
      companyId,
      notesScanned: notes.length,
      candidatesCreated: 0,
      fellBackToEmpty: false,
      windowStart,
      windowEnd,
      skippedReason: skipReason,
    };
  }

  const result = await mineSkills({
    companyId,
    notes,
    window: { start: windowStart, end: windowEnd },
    transport: transport.transport,
    model: transport.model,
    logger: deps.logger
      ? { warn: deps.logger.warn ?? (() => {}) }
      : undefined,
  });

  if (result.candidates.length === 0) {
    await deps.db
      .update(miningRuns)
      .set({
        notesScanned: notes.length,
        candidatesCreated: 0,
        fellBackToEmpty: result.fellBackToEmpty,
        llmModel: transport.model,
        llmProviderId: transport.providerId,
      })
      .where(eq(miningRuns.id, miningRunId));
    return {
      miningRunId,
      companyId,
      notesScanned: notes.length,
      candidatesCreated: 0,
      fellBackToEmpty: result.fellBackToEmpty,
      windowStart,
      windowEnd,
    };
  }

  const repo = new SkillCandidatesRepo(deps.db);
  await repo.insertMany(
    result.candidates.map((c) => ({
      companyId,
      agentId: c.agentId,
      name: c.name,
      title: c.title,
      body: c.body,
      rationale: c.rationale,
      sourceNoteIds: c.sourceNoteIds,
      patternFrequency: c.patternFrequency,
      llmModel: transport.model,
      llmProviderId: transport.providerId,
      miningRunId,
      windowStart,
      windowEnd,
    })),
  );

  await deps.db
    .update(miningRuns)
    .set({
      notesScanned: notes.length,
      candidatesCreated: result.candidates.length,
      fellBackToEmpty: result.fellBackToEmpty,
      llmModel: transport.model,
      llmProviderId: transport.providerId,
    })
    .where(eq(miningRuns.id, miningRunId));

  return {
    miningRunId,
    companyId,
    notesScanned: notes.length,
    candidatesCreated: result.candidates.length,
    fellBackToEmpty: result.fellBackToEmpty,
    windowStart,
    windowEnd,
  };
}
