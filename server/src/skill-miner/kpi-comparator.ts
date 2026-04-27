/**
 * Pure-logic decision: should a trial skill be auto-rolled-back?
 * (M2 G4 Phase I — KPI Comparator)
 *
 * Decision rule (v1, deliberately simple):
 *   1. The skill must have at least `minSamples` counted invocations
 *      (where "counted" = success + failure; unknowns excluded)
 *   2. If successRate < `minSuccessRate`, recommend rollback
 *
 * Why an absolute threshold rather than a baseline-vs-trial comparison:
 *   - Baseline matching needs a "similar production skill" heuristic
 *     (skill family / role-level grouping) which doesn't exist yet
 *   - An absolute floor catches the actually-bad cases (50% success on
 *     coding tasks is unambiguously broken) without false positives
 *     from missing-baseline issues
 *   - Spec §6.2's "vN+1 ≥ vN baseline" comparison applies to plugin
 *     code shadow execution, where v_N IS the baseline by definition;
 *     for skills there's no equivalent paired baseline yet
 *
 * Future (M2 G4-Full-Phase-I-2):
 *   - Per-role baseline rate (compare trial skill on Worker tasks vs
 *     baseline Worker success rate over same window)
 *   - Confidence intervals / Wilson scores rather than point estimate
 */

import type { SkillKpiSnapshot } from "./invocations-repo.js";

export interface RollbackDecisionConfig {
  /** Minimum success+failure invocations before any decision can fire. */
  minSamples: number;
  /** Below this success rate (0..1), recommend rollback. */
  minSuccessRate: number;
}

export interface RollbackDecision {
  shouldRollback: boolean;
  reason: string;
  countedSamples: number;
  successRate: number;
}

export const DEFAULT_ROLLBACK_CONFIG: RollbackDecisionConfig = {
  minSamples: 10,
  minSuccessRate: 0.5,
};

export function decideRollback(
  kpi: SkillKpiSnapshot,
  config: RollbackDecisionConfig = DEFAULT_ROLLBACK_CONFIG,
): RollbackDecision {
  const counted = kpi.successCount + kpi.failureCount;
  if (counted < config.minSamples) {
    return {
      shouldRollback: false,
      reason: `insufficient samples (${counted} < ${config.minSamples})`,
      countedSamples: counted,
      successRate: kpi.successRate,
    };
  }
  if (kpi.successRate < config.minSuccessRate) {
    return {
      shouldRollback: true,
      reason: `successRate ${(kpi.successRate * 100).toFixed(1)}% < ${(config.minSuccessRate * 100).toFixed(1)}% over ${counted} counted invocations`,
      countedSamples: counted,
      successRate: kpi.successRate,
    };
  }
  return {
    shouldRollback: false,
    reason: `successRate ${(kpi.successRate * 100).toFixed(1)}% meets threshold`,
    countedSamples: counted,
    successRate: kpi.successRate,
  };
}
