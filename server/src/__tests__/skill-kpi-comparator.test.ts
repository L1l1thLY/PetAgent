import { describe, it, expect } from "vitest";
import {
  decideRollback,
  DEFAULT_ROLLBACK_CONFIG,
} from "../skill-miner/kpi-comparator.js";
import type { SkillKpiSnapshot } from "../skill-miner/invocations-repo.js";

function snapshot(success: number, failure: number, unknown = 0): SkillKpiSnapshot {
  const counted = success + failure;
  return {
    skillId: "test",
    successCount: success,
    failureCount: failure,
    unknownCount: unknown,
    totalInvocations: counted + unknown,
    successRate: counted === 0 ? 0 : success / counted,
  };
}

describe("decideRollback: minSamples gate", () => {
  it("does not rollback below minSamples even when success rate is 0", () => {
    const d = decideRollback(snapshot(0, 5));
    expect(d.shouldRollback).toBe(false);
    expect(d.reason).toMatch(/insufficient samples/);
  });

  it("does not count unknowns toward minSamples threshold", () => {
    // 9 counted (all success) + 100 unknown — should still be below 10
    const d = decideRollback(snapshot(9, 0, 100));
    expect(d.shouldRollback).toBe(false);
    expect(d.reason).toMatch(/insufficient samples \(9 </);
  });
});

describe("decideRollback: success-rate threshold", () => {
  it("rolls back when success rate < 50% over ≥ 10 counted samples", () => {
    const d = decideRollback(snapshot(4, 6));
    expect(d.shouldRollback).toBe(true);
    expect(d.reason).toMatch(/successRate 40\.0%/);
  });

  it("keeps when success rate ≥ 50% with ≥ 10 samples", () => {
    const d = decideRollback(snapshot(5, 5));
    expect(d.shouldRollback).toBe(false);
    expect(d.reason).toMatch(/meets threshold/);
  });

  it("rolls back at exactly threshold-1 boundary", () => {
    // 49.9% on a million samples
    const d = decideRollback(snapshot(499, 501));
    expect(d.shouldRollback).toBe(true);
  });
});

describe("decideRollback: custom config", () => {
  it("respects custom minSamples", () => {
    const d = decideRollback(snapshot(0, 9), { minSamples: 5, minSuccessRate: 0.5 });
    expect(d.shouldRollback).toBe(true);
  });

  it("respects custom minSuccessRate (stricter 80%)", () => {
    const d = decideRollback(snapshot(7, 3), { minSamples: 10, minSuccessRate: 0.8 });
    expect(d.shouldRollback).toBe(true);
  });

  it("respects custom minSuccessRate (lax 30%)", () => {
    const d = decideRollback(snapshot(4, 6), { minSamples: 10, minSuccessRate: 0.3 });
    expect(d.shouldRollback).toBe(false);
  });
});

describe("decideRollback: response shape", () => {
  it("always returns countedSamples + successRate from input snapshot", () => {
    const d = decideRollback(snapshot(7, 3, 1));
    expect(d.countedSamples).toBe(10);
    expect(d.successRate).toBeCloseTo(0.7);
  });

  it("DEFAULT_ROLLBACK_CONFIG matches documented defaults", () => {
    expect(DEFAULT_ROLLBACK_CONFIG.minSamples).toBe(10);
    expect(DEFAULT_ROLLBACK_CONFIG.minSuccessRate).toBe(0.5);
  });
});
