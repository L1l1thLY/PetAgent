import { describe, it, expect, beforeEach, vi } from "vitest";
import { HookBus, type HookEvent } from "@petagent/hooks";
import { Psychologist } from "./main.js";
import { BehaviorMonitor } from "./behavior_monitor.js";
import { InterventionDispatcher } from "./dispatcher.js";
import type {
  AdapterCapabilities,
  BehavioralRecordsStore,
  CapabilitiesProvider,
  ClassifierClient,
  ClassifierResult,
  IncidentRecord,
  IncidentStore,
  PsychologistActions,
  RunSummary,
} from "./types.js";

const FULL_CAPS: AdapterCapabilities = {
  supportsInstructionsBundle: true,
  supportsBoardComment: true,
  supportsIssuePause: true,
  supportsIssueSplit: true,
};

function failedRuns(n: number): RunSummary[] {
  return Array.from({ length: n }, () => ({
    status: "failed",
    startedAt: new Date(),
    finishedAt: new Date(),
  }));
}

function makeStore(failures: number): BehavioralRecordsStore {
  return {
    async recentRuns() {
      return failedRuns(failures);
    },
    async recentOutputLengths() {
      return [];
    },
    async recentToolCalls() {
      return [];
    },
    async recentOutputs() {
      return [{ text: "I give up", length: 9, createdAt: new Date() }];
    },
  };
}

function makeClassifier(result: ClassifierResult): ClassifierClient {
  return {
    async classify() {
      return result;
    },
  };
}

interface Recorded {
  inserted: IncidentRecord[];
  outcomes: { id: string; outcome: IncidentRecord["outcome"]; notes?: string }[];
}

function makeIncidentStore(): { store: IncidentStore; recorded: Recorded } {
  const recorded: Recorded = { inserted: [], outcomes: [] };
  let nextId = 0;
  return {
    recorded,
    store: {
      async insert(record) {
        const id = `inc_${++nextId}`;
        recorded.inserted.push(record);
        return { id };
      },
      async updateOutcome(id, outcome, notes) {
        recorded.outcomes.push({ id, outcome, notes });
      },
      async recentForAgent() {
        return [];
      },
      async topSignalsForAgent() {
        return [];
      },
    },
  };
}

interface ActionsRec {
  injects: { agentId: string; content: string }[];
  comments: { agentId: string; content: string }[];
  pauses: string[];
  splits: { agentId: string; reason: string }[];
}

function makeActions(): { actions: PsychologistActions; rec: ActionsRec } {
  const rec: ActionsRec = { injects: [], comments: [], pauses: [], splits: [] };
  return {
    rec,
    actions: {
      async injectInstructions(agentId, content) {
        rec.injects.push({ agentId, content });
      },
      async postBoardComment(agentId, content) {
        rec.comments.push({ agentId, content });
      },
      async pauseIssue(agentId) {
        rec.pauses.push(agentId);
      },
      async splitIssue(agentId, reason) {
        rec.splits.push({ agentId, reason });
      },
    },
  };
}

const capsProvider: CapabilitiesProvider = {
  async forAgent() {
    return FULL_CAPS;
  },
};

interface BuildOpts {
  failures: number;
  classifierResult: ClassifierResult;
  cooldownMs?: number;
  bus?: HookBus;
  classifierSpy?: ClassifierClient;
}

function buildPsych(opts: BuildOpts) {
  const bus = opts.bus ?? new HookBus();
  const records = makeStore(opts.failures);
  const monitor = new BehaviorMonitor(records);
  const classifier = opts.classifierSpy ?? makeClassifier(opts.classifierResult);
  const { store: incidents, recorded } = makeIncidentStore();
  const { actions, rec } = makeActions();
  const dispatcher = new InterventionDispatcher(actions);
  const psych = new Psychologist({
    bus,
    monitor,
    classifier,
    dispatcher,
    incidents,
    capabilities: capsProvider,
    records,
    cooldownMs: opts.cooldownMs ?? 0,
  });
  return { bus, psych, recorded, rec };
}

const baseEvent: HookEvent = {
  type: "agent.output",
  companyId: "company_1",
  agentId: "agent_a",
  issueId: "issue_x",
  payload: { text: "I give up" },
  timestamp: new Date().toISOString(),
};

describe("Psychologist main loop", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("ignores events without an agentId", async () => {
    const { psych, bus, recorded } = buildPsych({
      failures: 5,
      classifierResult: {
        distress_level: 0.9,
        signals: ["frustration"],
        recommended_intervention: "moderate",
      },
    });
    await psych.start();
    await bus.publish({ ...baseEvent, agentId: undefined });
    expect(recorded.inserted).toHaveLength(0);
  });

  it("does nothing when behavior monitor reports severity=none", async () => {
    const { psych, bus, recorded, rec } = buildPsych({
      failures: 0,
      classifierResult: {
        distress_level: 0.1,
        signals: [],
        recommended_intervention: "none",
      },
    });
    await psych.start();
    await bus.publish(baseEvent);
    expect(recorded.inserted).toHaveLength(0);
    expect(rec.injects).toHaveLength(0);
  });

  it("does not dispatch when classifier reports recommended=none even if behavior signals fired", async () => {
    const { psych, bus, recorded, rec } = buildPsych({
      failures: 5,
      classifierResult: {
        distress_level: 0.05,
        signals: [],
        recommended_intervention: "none",
      },
    });
    await psych.start();
    await bus.publish(baseEvent);
    expect(recorded.inserted).toHaveLength(0);
    expect(rec.injects).toHaveLength(0);
  });

  it("end-to-end: behavior + classifier agree -> dispatches + records incident", async () => {
    const { psych, bus, recorded, rec } = buildPsych({
      failures: 5,
      classifierResult: {
        distress_level: 0.7,
        signals: ["frustration", "low_confidence"],
        recommended_intervention: "moderate",
      },
    });
    await psych.start();
    await bus.publish(baseEvent);

    expect(rec.injects.length + rec.comments.length).toBeGreaterThan(0);
    expect(recorded.inserted).toHaveLength(1);
    const inc = recorded.inserted[0];
    expect(inc.companyId).toBe("company_1");
    expect(inc.agentId).toBe("agent_a");
    expect(inc.issueId).toBe("issue_x");
    expect(inc.classification).toBe("moderate");
    expect(inc.signalType).toBe("both");
    expect(inc.outcome).toBe("pending");
    expect(inc.confidence).toBeCloseTo(0.7, 5);
    expect(inc.signalPayload.classifier).toMatchObject({
      recommended_intervention: "moderate",
    });
    expect(inc.interventionKind).toBe("instructions_inject_with_comment");
    expect(inc.interventionPayload.content).toMatch(/step back/i);
  });

  it("severe path pauses the issue and uses interventionKind=pause_therapy", async () => {
    const { psych, bus, recorded, rec } = buildPsych({
      failures: 6,
      classifierResult: {
        distress_level: 0.95,
        signals: ["giving_up"],
        recommended_intervention: "severe",
      },
    });
    await psych.start();
    await bus.publish(baseEvent);
    expect(rec.pauses).toEqual(["agent_a"]);
    expect(recorded.inserted[0].interventionKind).toBe("pause_therapy");
  });

  it("respects cooldown: same severity within cooldown window is suppressed", async () => {
    const { psych, bus, recorded } = buildPsych({
      failures: 5,
      classifierResult: {
        distress_level: 0.7,
        signals: ["frustration"],
        recommended_intervention: "mild",
      },
      cooldownMs: 60_000,
    });
    await psych.start();
    await bus.publish(baseEvent);
    await bus.publish({ ...baseEvent, timestamp: new Date().toISOString() });
    expect(recorded.inserted).toHaveLength(1);
  });

  it("cooldown is per (agent, severity): different severity is allowed through", async () => {
    const bus = new HookBus();
    const records = makeStore(5);
    const monitor = new BehaviorMonitor(records);
    const results: ClassifierResult[] = [
      { distress_level: 0.4, signals: ["frustration"], recommended_intervention: "mild" },
      { distress_level: 0.7, signals: ["frustration"], recommended_intervention: "moderate" },
    ];
    let callIdx = 0;
    const classifier: ClassifierClient = {
      async classify() {
        return results[callIdx++] ?? results[results.length - 1];
      },
    };
    const { store: incidents, recorded } = makeIncidentStore();
    const { actions } = makeActions();
    const psych = new Psychologist({
      bus,
      monitor,
      classifier,
      dispatcher: new InterventionDispatcher(actions),
      incidents,
      capabilities: capsProvider,
      records,
      cooldownMs: 60_000,
    });
    await psych.start();
    await bus.publish(baseEvent);
    await bus.publish(baseEvent);
    expect(recorded.inserted.map((i) => i.classification)).toEqual(["mild", "moderate"]);
  });

  it("cooldown elapses after wall time advances past the window", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-04-21T00:00:00Z");
    vi.setSystemTime(start);

    const { psych, bus, recorded } = buildPsych({
      failures: 5,
      classifierResult: {
        distress_level: 0.4,
        signals: ["frustration"],
        recommended_intervention: "mild",
      },
      cooldownMs: 60_000,
    });
    await psych.start();
    await bus.publish(baseEvent);
    expect(recorded.inserted).toHaveLength(1);

    vi.setSystemTime(new Date(start.getTime() + 90_000));
    await bus.publish(baseEvent);
    expect(recorded.inserted).toHaveLength(2);
  });

  it("subscribes to agent.output and heartbeat.ended (not other event types)", async () => {
    const bus = new HookBus();
    const classifySpy = vi.fn(async (): Promise<ClassifierResult> => ({
      distress_level: 0.7,
      signals: ["frustration"],
      recommended_intervention: "moderate",
    }));
    const classifier: ClassifierClient = { classify: classifySpy };
    const { psych } = buildPsych({
      failures: 5,
      classifierResult: {
        distress_level: 0.7,
        signals: [],
        recommended_intervention: "moderate",
      },
      bus,
      classifierSpy: classifier,
    });
    await psych.start();
    await bus.publish({
      type: "issue.created",
      companyId: "c",
      agentId: "agent_a",
      payload: {},
      timestamp: new Date().toISOString(),
    });
    expect(classifySpy).not.toHaveBeenCalled();
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "c",
      agentId: "agent_a",
      payload: {},
      timestamp: new Date().toISOString(),
    });
    expect(classifySpy).toHaveBeenCalled();
  });

  it("stop() unregisters the subscriber", async () => {
    const { psych, bus, recorded } = buildPsych({
      failures: 5,
      classifierResult: {
        distress_level: 0.7,
        signals: ["frustration"],
        recommended_intervention: "moderate",
      },
    });
    await psych.start();
    await psych.stop();
    await bus.publish(baseEvent);
    expect(recorded.inserted).toHaveLength(0);
  });
});
