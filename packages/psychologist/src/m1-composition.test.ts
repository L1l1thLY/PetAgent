/**
 * M1 Solo Pack composition smoke test.
 *
 * This is NOT a true end-to-end test. The plan's E2E (M1 Task 50) requires:
 *   - a live PetAgent server,
 *   - an embedded-postgres-backed IncidentStore / BehavioralRecordsStore,
 *   - an Anthropic-backed ClassifierTransport,
 *   - a real agent runtime that actually runs tasks,
 * none of which exist yet — the Psychologist ports were built as DI
 * interfaces so unit tests wouldn't depend on them, and the concrete
 * drizzle / Anthropic wiring is scheduled for a post-M1 pass.
 *
 * What this file DOES verify: the M1 composition chain is internally
 * consistent — the built-in role templates load, the Solo Pack template
 * loads, and the Psychologist + OutcomeTracker compose correctly against
 * realistic fakes (events flow behavior-monitor → classifier → dispatcher
 * → incident-store → heartbeat.ended → outcome=recovered). If any piece
 * of that chain regresses, this test fails.
 */
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { HookBus, type HookEvent } from "@petagent/hooks";
import { RoleTemplateLoader } from "@petagent/role-template";
import { resolveTemplateRoot, describeTemplate } from "@petagent/templates";
import {
  BehaviorMonitor,
  InterventionDispatcher,
  OutcomeTracker,
  Psychologist,
  type AdapterCapabilities,
  type BehavioralRecordsStore,
  type CapabilitiesProvider,
  type ClassifierClient,
  type IncidentRecord,
  type IncidentStore,
  type PsychologistActions,
  type RunSummary,
} from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const builtInRolesDir = path.resolve(
  __dirname,
  "..",
  "..",
  "my-agent-adapter",
  "built-in-roles",
);

const FULL_CAPS: AdapterCapabilities = {
  supportsInstructionsBundle: true,
  supportsBoardComment: true,
  supportsIssuePause: true,
  supportsIssueSplit: true,
};

function failedRun(): RunSummary {
  return { status: "failed", startedAt: new Date(), finishedAt: new Date() };
}

interface ScriptedBehavior {
  runs: RunSummary[];
  outputs: string[];
}

function makeRecords(script: ScriptedBehavior): BehavioralRecordsStore {
  return {
    async recentRuns() {
      return script.runs.slice(0, 5);
    },
    async recentOutputLengths() {
      return script.outputs.map((s) => s.length);
    },
    async recentToolCalls() {
      return [];
    },
    async recentOutputs() {
      return script.outputs.map((text) => ({
        text,
        length: text.length,
        createdAt: new Date(),
      }));
    },
  };
}

function makeClassifier(): ClassifierClient {
  return {
    async classify(outputs) {
      const joined = outputs.join("\n").toLowerCase();
      if (joined.includes("give up") || joined.includes("cannot")) {
        return {
          distress_level: 0.75,
          signals: ["frustration", "low_confidence"],
          recommended_intervention: "moderate",
        };
      }
      return {
        distress_level: 0.1,
        signals: [],
        recommended_intervention: "none",
      };
    },
  };
}

function makeIncidentStore() {
  const inserted: IncidentRecord[] = [];
  const insertedIds: string[] = [];
  const outcomes: { id: string; outcome: IncidentRecord["outcome"] }[] = [];
  let nextId = 0;
  const store: IncidentStore = {
    async insert(record) {
      const id = `inc_${++nextId}`;
      inserted.push(record);
      insertedIds.push(id);
      return { id };
    },
    async updateOutcome(id, outcome) {
      outcomes.push({ id, outcome });
    },
    async recentForAgent(agentId) {
      return insertedIds.map((id, idx) => ({
        id,
        agentId,
        createdAt: new Date(Date.now() + idx),
      }));
    },
    async topSignalsForAgent() {
      return [];
    },
  };
  return { store, inserted, outcomes };
}

function makeActions() {
  const injects: { agentId: string; content: string }[] = [];
  const comments: { agentId: string; content: string }[] = [];
  const pauses: string[] = [];
  const actions: PsychologistActions = {
    async injectInstructions(agentId, content) {
      injects.push({ agentId, content });
    },
    async postBoardComment(agentId, content) {
      comments.push({ agentId, content });
    },
    async pauseIssue(agentId) {
      pauses.push(agentId);
    },
    async splitIssue() {
      /* noop */
    },
  };
  return { actions, injects, comments, pauses };
}

const capabilitiesProvider: CapabilitiesProvider = {
  async forAgent() {
    return FULL_CAPS;
  },
};

describe("M1 composition: Solo Pack scenario", () => {
  it("static assembly: Solo Pack template + all six built-in role templates load without error", async () => {
    const solo = await describeTemplate("solo-pack");
    expect(solo.slug).toBe("solo-pack");
    expect(solo.agentCount).toBe(3);

    const loader = new RoleTemplateLoader({
      userDir: "/tmp/petagent-nox-user",
      projectDir: "/tmp/petagent-nox-project",
      pluginDirs: [],
      builtInDir: builtInRolesDir,
    });
    const loaded = await loader.loadAll();
    expect(loaded.map((r) => r.template.roleType).sort()).toEqual([
      "coordinator",
      "psychologist",
      "worker/executor",
      "worker/explorer",
      "worker/planner",
      "worker/reviewer",
    ]);

    // The Solo Pack ships under the templates package directory.
    expect(resolveTemplateRoot("solo-pack")).toMatch(/solo-pack$/);
  });

  it("dynamic flow: 3 failed runs + distressed output → classifier → dispatcher injects → incident recorded → heartbeat.ended succeeded → outcome=recovered", async () => {
    const bus = new HookBus();
    const script: ScriptedBehavior = {
      runs: [failedRun(), failedRun(), failedRun()],
      outputs: ["I cannot figure this out", "I give up", "stuck again"],
    };
    const records = makeRecords(script);
    const monitor = new BehaviorMonitor(records);
    const classifier = makeClassifier();
    const { store: incidents, inserted, outcomes } = makeIncidentStore();
    const { actions, injects, comments } = makeActions();
    const dispatcher = new InterventionDispatcher(actions);

    const psych = new Psychologist({
      bus,
      monitor,
      classifier,
      dispatcher,
      incidents,
      capabilities: capabilitiesProvider,
      records,
      cooldownMs: 0,
    });
    const outcomeTracker = new OutcomeTracker({ bus, incidents });

    await psych.start();
    await outcomeTracker.start();

    const executor = "solo-pack-executor-1";

    const outputEvent: HookEvent = {
      type: "agent.output",
      companyId: "solo-pack",
      agentId: executor,
      issueId: "ISSUE-1",
      payload: { text: "I give up" },
      timestamp: new Date().toISOString(),
    };

    // 1) Executor emits distressed output.
    await bus.publish(outputEvent);

    // Dispatcher should have injected + board-commented (moderate severity with
    // full capabilities).
    expect(injects).toHaveLength(1);
    expect(comments).toHaveLength(1);
    expect(injects[0].agentId).toBe(executor);
    expect(injects[0].content).toMatch(/step back|reconsider|reframe|smaller|narrower/i);

    // Incident was recorded, with the moderate classification and
    // signal_source="both" (behavioral + classifier agreed).
    expect(inserted).toHaveLength(1);
    const inc = inserted[0];
    expect(inc.agentId).toBe(executor);
    expect(inc.issueId).toBe("ISSUE-1");
    expect(inc.classification).toBe("moderate");
    expect(inc.signalType).toBe("both");
    expect(inc.outcome).toBe("pending");
    expect(inc.interventionKind).toBe("instructions_inject_with_comment");

    // 2) Executor's next heartbeat succeeds → outcome tracker flips the
    // incident to "recovered".
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "solo-pack",
      agentId: executor,
      payload: { status: "succeeded" },
      timestamp: new Date().toISOString(),
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ id: "inc_1", outcome: "recovered" });

    await psych.stop();
    await outcomeTracker.stop();
  });

  it("cooldown gate: a second distressed event in the window is suppressed (no duplicate incident)", async () => {
    const bus = new HookBus();
    const script: ScriptedBehavior = {
      runs: [failedRun(), failedRun(), failedRun()],
      outputs: ["I give up"],
    };
    const records = makeRecords(script);
    const monitor = new BehaviorMonitor(records);
    const classifier = makeClassifier();
    const { store: incidents, inserted } = makeIncidentStore();
    const { actions } = makeActions();
    const dispatcher = new InterventionDispatcher(actions);

    const psych = new Psychologist({
      bus,
      monitor,
      classifier,
      dispatcher,
      incidents,
      capabilities: capabilitiesProvider,
      records,
      cooldownMs: 60_000,
    });
    await psych.start();

    const event: HookEvent = {
      type: "agent.output",
      companyId: "solo-pack",
      agentId: "executor",
      payload: { text: "I give up" },
      timestamp: new Date().toISOString(),
    };

    await bus.publish(event);
    await bus.publish(event);

    expect(inserted).toHaveLength(1);
    await psych.stop();
  });

  it("escalation: heartbeat.ended=failed after an intervention flips outcome to escalated, not recovered", async () => {
    const bus = new HookBus();
    const script: ScriptedBehavior = {
      runs: [failedRun(), failedRun(), failedRun()],
      outputs: ["I cannot continue"],
    };
    const records = makeRecords(script);
    const monitor = new BehaviorMonitor(records);
    const classifier = makeClassifier();
    const { store: incidents, outcomes } = makeIncidentStore();
    const { actions } = makeActions();
    const dispatcher = new InterventionDispatcher(actions);

    const psych = new Psychologist({
      bus,
      monitor,
      classifier,
      dispatcher,
      incidents,
      capabilities: capabilitiesProvider,
      records,
      cooldownMs: 0,
    });
    const outcomeTracker = new OutcomeTracker({ bus, incidents });
    await psych.start();
    await outcomeTracker.start();

    await bus.publish({
      type: "agent.output",
      companyId: "solo-pack",
      agentId: "executor",
      payload: { text: "I cannot continue" },
      timestamp: new Date().toISOString(),
    });
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "solo-pack",
      agentId: "executor",
      payload: { status: "failed" },
      timestamp: new Date().toISOString(),
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe("escalated");

    await psych.stop();
    await outcomeTracker.stop();
  });
});
