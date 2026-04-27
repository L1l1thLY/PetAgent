/**
 * Auto-rollback routine (M2 G4 Phase I).
 *
 * For every trial skill, computes a KPI snapshot from skill_invocations
 * and runs decideRollback. Rollback = flip status to "retired" + set
 * archivedAt + (optional) notify via the notification bridge so the
 * user sees what just happened in the bell.
 *
 * Phase H made it explicit that nothing yet WRITES skill_invocations
 * rows from production traffic — until that ships, this routine will
 * almost always early-out with "insufficient samples". That's fine:
 * once the prompt-augmentation feature lands, this routine is already
 * watching.
 */

import { eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agentSkills } from "@petagent/db";
import {
  SkillInvocationsRepo,
  type SkillKpiSnapshot,
} from "./invocations-repo.js";
import {
  DEFAULT_ROLLBACK_CONFIG,
  decideRollback,
  type RollbackDecisionConfig,
  type RollbackDecision,
} from "./kpi-comparator.js";

export interface SkillRollbackRoutineOptions {
  db: Db;
  config?: RollbackDecisionConfig;
  intervalMs?: number;
  /** Optional callback invoked after each rollback so callers can
   *  emit notifications / activity log entries. */
  onRollback?: (event: {
    skillId: string;
    skillName: string;
    companyId: string;
    decision: RollbackDecision;
    kpi: SkillKpiSnapshot;
  }) => void | Promise<void>;
  logger?: { info?(msg: string): void; warn?(msg: string, meta?: unknown): void };
  onCycleError?: (err: unknown) => void;
}

export interface RunningSkillRollbackRoutine {
  stop(): void;
  runOnce(): Promise<{ evaluated: number; rolledBack: number }>;
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function startSkillRollbackRoutine(
  opts: SkillRollbackRoutineOptions,
): RunningSkillRollbackRoutine {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const config = opts.config ?? DEFAULT_ROLLBACK_CONFIG;
  const repo = new SkillInvocationsRepo(opts.db);

  async function runOnce() {
    let evaluated = 0;
    let rolledBack = 0;
    try {
      const trialSkills = await opts.db
        .select({
          id: agentSkills.id,
          name: agentSkills.name,
          companyId: agentSkills.companyId,
        })
        .from(agentSkills)
        .where(eq(agentSkills.status, "trial"));

      for (const skill of trialSkills) {
        evaluated += 1;
        try {
          const kpi = await repo.kpiForSkill(skill.id);
          const decision = decideRollback(kpi, config);
          if (decision.shouldRollback) {
            await opts.db
              .update(agentSkills)
              .set({
                status: "retired",
                archivedAt: new Date(),
              })
              .where(eq(agentSkills.id, skill.id));
            rolledBack += 1;
            opts.logger?.info?.(
              `[skill-rollback] retired ${skill.name} (${skill.id}) — ${decision.reason}`,
            );
            await opts.onRollback?.({
              skillId: skill.id,
              skillName: skill.name,
              companyId: skill.companyId,
              decision,
              kpi,
            });
          }
        } catch (err) {
          opts.logger?.warn?.(
            `[skill-rollback] eval failed for skill=${skill.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      opts.logger?.warn?.(
        `[skill-rollback] outer cycle failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      opts.onCycleError?.(err);
    }
    return { evaluated, rolledBack };
  }

  const handle = setInterval(() => {
    void runOnce();
  }, intervalMs);
  setTimeout(() => void runOnce(), 60_000).unref();

  return {
    stop: () => clearInterval(handle),
    runOnce,
  };
}
