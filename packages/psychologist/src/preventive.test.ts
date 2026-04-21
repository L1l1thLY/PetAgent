import { describe, it, expect } from "vitest";
import { getPreventiveSuffix, describeSignal } from "./preventive.js";
import type { IncidentStore, IncidentRecord } from "./types.js";

function makeStore(top: { signal: string; count: number }[]): IncidentStore {
  return {
    async insert() {
      return { id: "x" };
    },
    async updateOutcome() {
      // noop
    },
    async recentForAgent() {
      return [];
    },
    async topSignalsForAgent(_agentId, _sinceDays) {
      return top;
    },
  };
}

describe("describeSignal", () => {
  it("returns specific guidance for the documented signals", () => {
    for (const sig of [
      "frustration",
      "low_confidence",
      "confusion",
      "over_cautious",
      "giving_up",
      "angry",
    ]) {
      const t = describeSignal(sig);
      expect(t.length, sig).toBeGreaterThan(20);
      expect(t.toLowerCase()).toContain("recognize");
    }
  });

  it("returns a generic fallback for unknown signals", () => {
    const t = describeSignal("never_heard_of_this");
    expect(t).toMatch(/never_heard_of_this/);
  });
});

describe("getPreventiveSuffix", () => {
  it("returns null when no incidents are recorded", async () => {
    const store = makeStore([]);
    const suffix = await getPreventiveSuffix("a1", store);
    expect(suffix).toBeNull();
  });

  it("includes the documented-failure-modes header when there are signals", async () => {
    const store = makeStore([
      { signal: "frustration", count: 12 },
      { signal: "low_confidence", count: 6 },
      { signal: "over_cautious", count: 3 },
    ]);
    const suffix = await getPreventiveSuffix("a1", store);
    expect(suffix).not.toBeNull();
    expect(suffix!).toMatch(/Documented Failure Modes/);
  });

  it("lists at most three signals, in store-supplied order", async () => {
    const store = makeStore([
      { signal: "frustration", count: 12 },
      { signal: "low_confidence", count: 6 },
      { signal: "over_cautious", count: 3 },
      { signal: "confusion", count: 2 },
    ]);
    const suffix = await getPreventiveSuffix("a1", store);
    const lines = suffix!.split("\n").filter((l) => /^\d+\./.test(l));
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/frustration|Frustration/);
    expect(lines[2]).toMatch(/over_cautious|cautious/i);
    expect(suffix!).not.toMatch(/confusion/);
  });

  it("uses describeSignal output for each entry (not raw token)", async () => {
    const store = makeStore([
      { signal: "frustration", count: 5 },
    ]);
    const suffix = await getPreventiveSuffix("a1", store);
    expect(suffix!).toMatch(describeSignal("frustration").slice(0, 40));
  });

  it("respects custom sinceDays via the parameter", async () => {
    let captured = -1;
    const store: IncidentStore = {
      async insert() {
        return { id: "x" };
      },
      async updateOutcome() {
        // noop
      },
      async recentForAgent() {
        return [];
      },
      async topSignalsForAgent(_agentId, sinceDays) {
        captured = sinceDays;
        return [];
      },
    };
    await getPreventiveSuffix("a1", store, { sinceDays: 7 });
    expect(captured).toBe(7);
  });

  it("returns null when topSignalsForAgent returns only zero-count entries", async () => {
    const store = makeStore([
      { signal: "frustration", count: 0 },
    ]);
    const suffix = await getPreventiveSuffix("a1", store);
    expect(suffix).toBeNull();
  });

  it("type-only smoke: IncidentRecord is exported and shaped as expected", () => {
    const _r: IncidentRecord = {
      companyId: "c",
      agentId: "a",
      signalType: "behavioral",
      classification: "mild",
      confidence: 0.4,
      signalPayload: {},
      interventionKind: "instructions_inject",
      interventionPayload: {},
      outcome: "pending",
    };
    expect(_r.outcome).toBe("pending");
  });
});
