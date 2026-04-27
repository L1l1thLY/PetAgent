import { describe, it, expect } from "vitest";
import { startSkillArchiveRoutine } from "../skill-miner/archive-routine.js";
import type { Db } from "@petagent/db";

/**
 * Schema-aware SQL is hard to mock without spinning up a real Postgres,
 * so this test focuses on the routine plumbing: setInterval lifecycle,
 * runOnce error swallowing, and onCycleError propagation. The actual
 * UPDATE clause is exercised by the integration suite when migration
 * 0061 is applied to the embedded postgres.
 */

interface FakeDb {
  update: ReturnType<typeof makeFakeUpdateBuilder>;
}

function makeFakeUpdateBuilder(rowsToReturn: Array<{ id: string; name: string }>) {
  return () => ({
    set: () => ({
      where: () => ({
        returning: async () => rowsToReturn,
      }),
    }),
  });
}

describe("startSkillArchiveRoutine: lifecycle", () => {
  it("runOnce resolves with archived count from DB", async () => {
    const db = {
      update: makeFakeUpdateBuilder([
        { id: "s1", name: "skill-a" },
        { id: "s2", name: "skill-b" },
      ]),
    } as unknown as Db;
    const r = startSkillArchiveRoutine({ db, intervalMs: 1_000_000 });
    const out = await r.runOnce();
    expect(out.archived).toBe(2);
    r.stop();
  });

  it("runOnce swallows errors and reports 0", async () => {
    const db = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => {
              throw new Error("postgres exploded");
            },
          }),
        }),
      }),
    } as unknown as Db;
    const warnings: string[] = [];
    const errors: unknown[] = [];
    const r = startSkillArchiveRoutine({
      db,
      intervalMs: 1_000_000,
      logger: { warn: (m) => warnings.push(m) },
      onCycleError: (e) => errors.push(e),
    });
    const out = await r.runOnce();
    expect(out.archived).toBe(0);
    expect(warnings.some((w) => /cycle failed/.test(w))).toBe(true);
    expect(errors).toHaveLength(1);
    r.stop();
  });

  it("logs the archived skill names when count > 0", async () => {
    const db = {
      update: makeFakeUpdateBuilder([{ id: "s1", name: "stale-skill" }]),
    } as unknown as Db;
    const infos: string[] = [];
    const r = startSkillArchiveRoutine({
      db,
      intervalMs: 1_000_000,
      logger: { info: (m) => infos.push(m) },
    });
    await r.runOnce();
    expect(infos.some((i) => /stale-skill/.test(i))).toBe(true);
    r.stop();
  });

  it("does NOT log when count = 0", async () => {
    const db = {
      update: makeFakeUpdateBuilder([]),
    } as unknown as Db;
    const infos: string[] = [];
    const r = startSkillArchiveRoutine({
      db,
      intervalMs: 1_000_000,
      logger: { info: (m) => infos.push(m) },
    });
    await r.runOnce();
    expect(infos).toEqual([]);
    r.stop();
  });

  it("stop() unblocks the interval", () => {
    const db = {
      update: makeFakeUpdateBuilder([]),
    } as unknown as Db;
    const r = startSkillArchiveRoutine({ db, intervalMs: 1_000_000 });
    r.stop();
    // Should not throw on second stop:
    r.stop();
  });
});
