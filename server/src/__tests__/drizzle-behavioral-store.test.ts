import { describe, it, expect } from "vitest";
import type { Db } from "@petagent/db";
import type { BehavioralRecordsStore } from "@petagent/psychologist";
import { DrizzleBehavioralRecordsStore } from "../psychologist/drizzle_behavioral_store.js";

describe("DrizzleBehavioralRecordsStore shape", () => {
  it("constructor is cheap", () => {
    expect(() => new DrizzleBehavioralRecordsStore({} as unknown as Db)).not.toThrow();
  });

  it("satisfies the BehavioralRecordsStore port structurally", () => {
    const store: BehavioralRecordsStore = new DrizzleBehavioralRecordsStore(
      {} as unknown as Db,
    );
    expect(typeof store.recentRuns).toBe("function");
    expect(typeof store.recentOutputLengths).toBe("function");
    expect(typeof store.recentToolCalls).toBe("function");
    expect(typeof store.recentOutputs).toBe("function");
  });

  it("recentToolCalls returns [] (structured tool events not yet emitted)", async () => {
    const store = new DrizzleBehavioralRecordsStore({} as unknown as Db);
    expect(await store.recentToolCalls("any", 10)).toEqual([]);
  });
});
