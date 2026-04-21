import { describe, it, expect } from "vitest";
import { BehaviorMonitor } from "./behavior_monitor.js";
import type {
  BehavioralRecordsStore,
  RunSummary,
  ToolCallSample,
  OutputSample,
} from "./types.js";

function makeStore(overrides: Partial<BehavioralRecordsStore> = {}): BehavioralRecordsStore {
  const empty: BehavioralRecordsStore = {
    async recentRuns() {
      return [];
    },
    async recentOutputLengths() {
      return [];
    },
    async recentToolCalls() {
      return [];
    },
    async recentOutputs() {
      return [];
    },
  };
  return { ...empty, ...overrides };
}

function failedRuns(n: number): RunSummary[] {
  return Array.from({ length: n }, () => ({
    status: "failed",
    startedAt: new Date(),
    finishedAt: new Date(),
  }));
}

describe("BehaviorMonitor", () => {
  it("returns severity=none on a healthy agent (no signals)", async () => {
    const m = new BehaviorMonitor(makeStore());
    const sig = await m.check("agent_a");
    expect(sig.behavioralSeverity).toBe("none");
    expect(sig.signals).toEqual([]);
  });

  it("flags 3+ consecutive failures as a single signal -> mild", async () => {
    const m = new BehaviorMonitor(
      makeStore({
        async recentRuns() {
          return [...failedRuns(3), { status: "succeeded", startedAt: null, finishedAt: null }];
        },
      }),
    );
    const sig = await m.check("a");
    expect(sig.signals).toContain("consecutive_failures");
    expect(sig.behavioralSeverity).toBe("mild");
    expect(sig.details.consecutiveFails).toBe(3);
  });

  it("does not flag 2 consecutive failures", async () => {
    const m = new BehaviorMonitor(
      makeStore({
        async recentRuns() {
          return [...failedRuns(2), { status: "succeeded", startedAt: null, finishedAt: null }];
        },
      }),
    );
    const sig = await m.check("a");
    expect(sig.signals).not.toContain("consecutive_failures");
  });

  it("flags output length collapse (recent < mean - 2σ)", async () => {
    const lengths = [
      // baseline 10 stable longish outputs
      900, 1000, 950, 1100, 1050, 980, 1020, 1010, 990, 1030,
      // 3 short ones (way below baseline)
      40, 35, 30,
    ];
    const m = new BehaviorMonitor(
      makeStore({
        async recentOutputLengths() {
          return lengths;
        },
      }),
    );
    const sig = await m.check("a");
    expect(sig.signals).toContain("output_length_drop");
    expect(sig.details.lengthTrend).toEqual([1010, 990, 1030, 40, 35, 30].slice(-5));
  });

  it("does not flag output length drop with too few samples", async () => {
    const m = new BehaviorMonitor(
      makeStore({
        async recentOutputLengths() {
          return [100, 50, 30];
        },
      }),
    );
    const sig = await m.check("a");
    expect(sig.signals).not.toContain("output_length_drop");
  });

  it("flags tool error rate > 50%", async () => {
    const calls: ToolCallSample[] = [
      ...Array(6).fill(null).map(() => ({ succeeded: false, createdAt: new Date() })),
      ...Array(4).fill(null).map(() => ({ succeeded: true, createdAt: new Date() })),
    ];
    const m = new BehaviorMonitor(
      makeStore({
        async recentToolCalls() {
          return calls;
        },
      }),
    );
    const sig = await m.check("a");
    expect(sig.signals).toContain("tool_error_rate_high");
    expect(sig.details.toolErrorRate).toBeCloseTo(0.6, 5);
  });

  it("does not flag tool error rate when calls < 5 (insufficient data)", async () => {
    const calls: ToolCallSample[] = [
      { succeeded: false, createdAt: new Date() },
      { succeeded: false, createdAt: new Date() },
    ];
    const m = new BehaviorMonitor(
      makeStore({
        async recentToolCalls() {
          return calls;
        },
      }),
    );
    const sig = await m.check("a");
    expect(sig.signals).not.toContain("tool_error_rate_high");
  });

  it("aggregates 2 signals -> moderate", async () => {
    const m = new BehaviorMonitor(
      makeStore({
        async recentRuns() {
          return failedRuns(4);
        },
        async recentToolCalls() {
          return Array(8)
            .fill(null)
            .map(() => ({ succeeded: false, createdAt: new Date() }));
        },
      }),
    );
    const sig = await m.check("a");
    expect(sig.signals.length).toBe(2);
    expect(sig.behavioralSeverity).toBe("moderate");
  });

  it("aggregates 3 signals -> severe", async () => {
    const lengths = [800, 900, 850, 1000, 950, 920, 880, 910, 870, 940, 30, 25, 20];
    const m = new BehaviorMonitor(
      makeStore({
        async recentRuns() {
          return failedRuns(3);
        },
        async recentToolCalls() {
          return Array(10)
            .fill(null)
            .map(() => ({ succeeded: false, createdAt: new Date() }));
        },
        async recentOutputLengths() {
          return lengths;
        },
      }),
    );
    const sig = await m.check("a");
    expect(sig.signals.length).toBe(3);
    expect(sig.behavioralSeverity).toBe("severe");
  });

  it("uses sample type to silence unused field", async () => {
    const _outputs: OutputSample[] = [{ text: "hi", length: 2, createdAt: new Date() }];
    expect(_outputs[0].text).toBe("hi");
  });
});
