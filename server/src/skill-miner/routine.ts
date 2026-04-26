/**
 * Periodic SkillMiner runner (M2 G4 §5.2 — "周批 Skill 挖掘").
 *
 * Mirrors the budget-check-routine pattern: setInterval-based, fires
 * one cycle across all companies per tick. Default cadence = weekly
 * (7 days); operators can shorten via PETAGENT_SKILL_MINING_INTERVAL_MS
 * for testing. The Run-Now button is the primary first-touch tester
 * anyway — the cron is set-and-forget.
 *
 * Restart caveat: setInterval resets when the server restarts, so a
 * Monday boot won't necessarily keep aligning with Mondays. For MVP
 * this is acceptable; M3 can move to a wall-clock-aware scheduler.
 */

import type { Db } from "@petagent/db";
import { companies } from "@petagent/db";
import { mineForCompany, type SkillMinerRunnerDeps } from "./runner.js";

export interface SkillMiningRoutineOptions extends SkillMinerRunnerDeps {
  intervalMs?: number;
  onCycleError?: (err: unknown) => void;
}

export interface RunningSkillMiningRoutine {
  stop(): void;
  runOnce(): Promise<void>;
}

const DEFAULT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function startSkillMiningRoutine(
  opts: SkillMiningRoutineOptions,
): RunningSkillMiningRoutine {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  async function runOnce() {
    try {
      const allCompanies = await opts.db
        .select({ id: companies.id })
        .from(companies);
      for (const c of allCompanies) {
        try {
          const r = await mineForCompany(opts, c.id);
          opts.logger?.info?.(
            `[skill-miner] company=${r.companyId} run=${r.miningRunId} notes=${r.notesScanned} candidates=${r.candidatesCreated}${r.skippedReason ? ` skipped=${r.skippedReason}` : ""}`,
          );
        } catch (err) {
          opts.logger?.warn?.(
            `[skill-miner] cycle failed for company=${c.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          opts.onCycleError?.(err);
        }
      }
    } catch (err) {
      opts.logger?.warn?.(
        `[skill-miner] outer cycle failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      opts.onCycleError?.(err);
    }
  }

  const handle = setInterval(() => {
    void runOnce();
  }, intervalMs);
  // Fire once shortly after boot — but not blocking startup.
  setTimeout(() => void runOnce(), 5_000).unref();

  return {
    stop: () => clearInterval(handle),
    runOnce,
  };
}
