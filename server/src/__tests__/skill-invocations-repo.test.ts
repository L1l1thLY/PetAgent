import { describe, it, expect, vi } from "vitest";
import { SkillInvocationsRepo } from "../skill-miner/invocations-repo.js";
import type { Db } from "@petagent/db";

/**
 * SQL semantics live in Drizzle + the live DB; here we cover the
 * record-construction + KPI-math surface without spinning up postgres.
 * The KPI rollup logic (success-rate denominator excluding "unknown")
 * is the only branch that actually warrants a unit test — everything
 * else is pass-through to Drizzle.
 */

function fakeDbForKpi(rows: Array<{ outcomeStatus: string | null; n: number }>): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: async () => rows,
        }),
      }),
    }),
  } as unknown as Db;
}

function fakeDbForInsert(returnRow: unknown): Db {
  return {
    insert: () => ({
      values: () => ({
        returning: async () => [returnRow],
      }),
    }),
  } as unknown as Db;
}

function fakeDbForUpdate(returnedRows: Array<{ id: string }>): Db {
  return {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => returnedRows,
        }),
      }),
    }),
  } as unknown as Db;
}

describe("SkillInvocationsRepo: kpiForSkill", () => {
  it("computes success rate from success / (success + failure), excluding unknowns from denominator", async () => {
    const db = fakeDbForKpi([
      { outcomeStatus: "success", n: 7 },
      { outcomeStatus: "failure", n: 2 },
      { outcomeStatus: null, n: 5 },
    ]);
    const repo = new SkillInvocationsRepo(db);
    const k = await repo.kpiForSkill("skill-1");
    expect(k.successCount).toBe(7);
    expect(k.failureCount).toBe(2);
    expect(k.unknownCount).toBe(5);
    expect(k.totalInvocations).toBe(14);
    expect(k.successRate).toBeCloseTo(7 / 9);
  });

  it("buckets explicit 'unknown' outcomeStatus into unknown alongside null", async () => {
    const db = fakeDbForKpi([
      { outcomeStatus: "success", n: 3 },
      { outcomeStatus: "unknown", n: 4 },
      { outcomeStatus: null, n: 2 },
    ]);
    const repo = new SkillInvocationsRepo(db);
    const k = await repo.kpiForSkill("s");
    expect(k.unknownCount).toBe(6); // 4 + 2
  });

  it("returns successRate=0 when no success/failure outcomes recorded yet", async () => {
    const db = fakeDbForKpi([{ outcomeStatus: null, n: 3 }]);
    const repo = new SkillInvocationsRepo(db);
    const k = await repo.kpiForSkill("s");
    expect(k.successRate).toBe(0);
    expect(k.totalInvocations).toBe(3);
  });

  it("returns zero counts when no rows returned at all", async () => {
    const db = fakeDbForKpi([]);
    const repo = new SkillInvocationsRepo(db);
    const k = await repo.kpiForSkill("s");
    expect(k.totalInvocations).toBe(0);
    expect(k.successCount).toBe(0);
    expect(k.successRate).toBe(0);
  });
});

describe("SkillInvocationsRepo: recordExposure / markOutcome", () => {
  it("recordExposure inserts and returns the row", async () => {
    const fakeRow = { id: "inv-1", skillId: "s", agentId: "a" };
    const db = fakeDbForInsert(fakeRow);
    const repo = new SkillInvocationsRepo(db);
    const out = await repo.recordExposure({
      companyId: "c",
      agentId: "a",
      skillId: "s",
      exposureType: "production",
      skillStatus: "active",
    });
    expect(out).toBe(fakeRow);
  });

  it("markOutcome returns count of rows updated", async () => {
    const db = fakeDbForUpdate([{ id: "x" }, { id: "y" }]);
    const repo = new SkillInvocationsRepo(db);
    const n = await repo.markOutcome({ runId: "r1", outcomeStatus: "success" });
    expect(n).toBe(2);
  });

  it("markOutcome returns 0 when no matching rows", async () => {
    const db = fakeDbForUpdate([]);
    const repo = new SkillInvocationsRepo(db);
    const n = await repo.markOutcome({ runId: "missing", outcomeStatus: "failure" });
    expect(n).toBe(0);
  });
});
