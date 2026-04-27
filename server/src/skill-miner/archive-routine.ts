/**
 * Auto-archive routine for trial skills (M2 G4 Phase G).
 *
 * Trial skills that haven't been touched in `archiveDays` days flip to
 * status='retired' with archivedAt populated. Without this, the
 * skill list grows unbounded as candidates get promoted but never
 * curated by humans.
 *
 * Compares against COALESCE(last_accessed_at, created_at) — last
 * access is the source of truth when present, otherwise creation
 * time keeps the threshold meaningful for skills nobody has used yet.
 *
 * v1 caveat: nothing currently bumps lastAccessedAt on read. That
 * path lands in the next M2 G4 Full sub-phase (Phase G-2 — skill
 * read instrumentation). For now, all trial skills age out from
 * createdAt, which means the threshold is effectively a TTL until
 * Phase G-2 ships. Acceptable for MVP because users review
 * candidates within hours, not weeks.
 */

import { and, eq, lt, or, isNull, sql } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agentSkills } from "@petagent/db";

export interface SkillArchiveRoutineOptions {
  db: Db;
  intervalMs?: number;
  archiveDays?: number;
  logger?: { info?(msg: string): void; warn?(msg: string, meta?: unknown): void };
  onCycleError?: (err: unknown) => void;
}

export interface RunningSkillArchiveRoutine {
  stop(): void;
  runOnce(): Promise<{ archived: number }>;
}

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_ARCHIVE_DAYS = 30;

export function startSkillArchiveRoutine(
  opts: SkillArchiveRoutineOptions,
): RunningSkillArchiveRoutine {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const archiveDays = opts.archiveDays ?? DEFAULT_ARCHIVE_DAYS;

  async function runOnce(): Promise<{ archived: number }> {
    try {
      const cutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000);
      const updated = await opts.db
        .update(agentSkills)
        .set({
          status: "retired",
          archivedAt: new Date(),
        })
        .where(
          and(
            eq(agentSkills.status, "trial"),
            or(
              and(
                isNull(agentSkills.lastAccessedAt),
                lt(agentSkills.createdAt, cutoff),
              ),
              lt(agentSkills.lastAccessedAt, cutoff),
            ),
          ),
        )
        .returning({ id: agentSkills.id, name: agentSkills.name });
      if (updated.length > 0) {
        opts.logger?.info?.(
          `[skill-archive] archived ${updated.length} trial skill(s) idle ≥${archiveDays}d: ${updated.map((u) => u.name).join(", ")}`,
        );
      }
      return { archived: updated.length };
    } catch (err) {
      opts.logger?.warn?.(
        `[skill-archive] cycle failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      opts.onCycleError?.(err);
      return { archived: 0 };
    }
  }

  const handle = setInterval(() => {
    void runOnce();
  }, intervalMs);
  setTimeout(() => void runOnce(), 30_000).unref();

  return {
    stop: () => clearInterval(handle),
    runOnce,
  };
}

/**
 * One-shot helper for tests / manual invocation. Same logic as
 * runOnce above but caller-managed (no setInterval).
 */
export async function runSkillArchiveOnce(
  db: Db,
  archiveDays = DEFAULT_ARCHIVE_DAYS,
): Promise<{ archived: number; ids: string[] }> {
  const cutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000);
  const updated = await db
    .update(agentSkills)
    .set({
      status: "retired",
      archivedAt: new Date(),
    })
    .where(
      and(
        eq(agentSkills.status, "trial"),
        or(
          and(
            isNull(agentSkills.lastAccessedAt),
            lt(agentSkills.createdAt, cutoff),
          ),
          lt(agentSkills.lastAccessedAt, cutoff),
        ),
      ),
    )
    .returning({ id: agentSkills.id });
  return { archived: updated.length, ids: updated.map((u) => u.id) };
}
