import { describe, it, expect, vi } from "vitest";
import { DrizzleReflectionContextSource } from "../reflector/drizzle_context_source.js";
import type { Db } from "@petagent/db";

interface RecordsStore {
  recentOutputs(agentId: string, limit: number): Promise<Array<{ text: string }>>;
}

function makeRecordsStore(outputs: string[]): RecordsStore {
  return {
    recentOutputs: vi.fn(async () => outputs.map((text) => ({ text }))),
  };
}

function makeFakeDb(rows: Array<{ title: string; description: string | null }>): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  } as unknown as Db;
}

describe("DrizzleReflectionContextSource", () => {
  it("returns recent outputs and issue context", async () => {
    const records = makeRecordsStore(["out 1", "out 2"]);
    const src = new DrizzleReflectionContextSource({
      db: makeFakeDb([{ title: "Deploy", description: "Make deploy work" }]),
      records: records as never,
    });
    const ctx = await src.fetchContext({ agentId: "a-1", issueId: "i-1" });
    expect(ctx.recentOutputs).toEqual(["out 1", "out 2"]);
    expect(ctx.issueTitle).toBe("Deploy");
    expect(ctx.issueDescription).toBe("Make deploy work");
  });

  it("returns recent outputs only when issueId is missing", async () => {
    const records = makeRecordsStore(["only output"]);
    const src = new DrizzleReflectionContextSource({
      db: makeFakeDb([]),
      records: records as never,
    });
    const ctx = await src.fetchContext({ agentId: "a-1" });
    expect(ctx.recentOutputs).toEqual(["only output"]);
    expect(ctx.issueTitle).toBeUndefined();
    expect(ctx.issueDescription).toBeUndefined();
  });

  it("returns empty outputs when records store throws", async () => {
    const records = {
      recentOutputs: async () => { throw new Error("store down"); },
    };
    const src = new DrizzleReflectionContextSource({
      db: makeFakeDb([{ title: "x", description: null }]),
      records: records as never,
    });
    const ctx = await src.fetchContext({ agentId: "a-1", issueId: "i-1" });
    expect(ctx.recentOutputs).toEqual([]);
    expect(ctx.issueTitle).toBe("x");
  });
});
