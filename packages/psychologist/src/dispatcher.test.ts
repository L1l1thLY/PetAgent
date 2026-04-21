import { describe, it, expect } from "vitest";
import { InterventionDispatcher } from "./dispatcher.js";
import type { AdapterCapabilities, PsychologistActions } from "./types.js";

interface RecordedCall {
  kind: "inject" | "comment" | "pause" | "split";
  agentId: string;
  content: string;
}

function mockActions(): { actions: PsychologistActions; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    actions: {
      async injectInstructions(agentId, content) {
        calls.push({ kind: "inject", agentId, content });
      },
      async postBoardComment(agentId, content) {
        calls.push({ kind: "comment", agentId, content });
      },
      async pauseIssue(agentId) {
        calls.push({ kind: "pause", agentId, content: "" });
      },
      async splitIssue(agentId, reason) {
        calls.push({ kind: "split", agentId, content: reason });
      },
    },
  };
}

const FULL_CAPS: AdapterCapabilities = {
  supportsInstructionsBundle: true,
  supportsBoardComment: true,
  supportsIssuePause: true,
  supportsIssueSplit: true,
};

const FALLBACK_CAPS: AdapterCapabilities = {
  supportsInstructionsBundle: false,
  supportsBoardComment: true,
  supportsIssuePause: false,
  supportsIssueSplit: false,
};

describe("InterventionDispatcher", () => {
  it("severe -> pauses the issue (and only pauses)", async () => {
    const { actions, calls } = mockActions();
    const d = new InterventionDispatcher(actions);
    const result = await d.dispatch({
      targetAgentId: "a1",
      severity: "severe",
      content: "stop",
      capabilities: FULL_CAPS,
    });
    expect(result.kind).toBe("pause_therapy");
    expect(result.succeeded).toBe(true);
    expect(calls).toEqual([{ kind: "pause", agentId: "a1", content: "" }]);
  });

  it("moderate with full caps -> injects + posts board comment", async () => {
    const { actions, calls } = mockActions();
    const d = new InterventionDispatcher(actions);
    const result = await d.dispatch({
      targetAgentId: "a2",
      severity: "moderate",
      content: "step back",
      capabilities: FULL_CAPS,
    });
    expect(result.kind).toBe("instructions_inject_with_comment");
    expect(calls.map((c) => c.kind).sort()).toEqual(["comment", "inject"]);
    const inject = calls.find((c) => c.kind === "inject")!;
    expect(inject.content).toBe("step back");
  });

  it("mild with full caps -> only injects (no comment)", async () => {
    const { actions, calls } = mockActions();
    const d = new InterventionDispatcher(actions);
    const result = await d.dispatch({
      targetAgentId: "a3",
      severity: "mild",
      content: "breathe",
      capabilities: FULL_CAPS,
    });
    expect(result.kind).toBe("instructions_inject");
    expect(calls.map((c) => c.kind)).toEqual(["inject"]);
  });

  it("falls back to board comment when InstructionsBundle is unsupported", async () => {
    const { actions, calls } = mockActions();
    const d = new InterventionDispatcher(actions);
    const result = await d.dispatch({
      targetAgentId: "a4",
      severity: "mild",
      content: "hint",
      capabilities: FALLBACK_CAPS,
    });
    expect(result.kind).toBe("board_comment");
    expect(calls).toEqual([{ kind: "comment", agentId: "a4", content: "hint" }]);
  });

  it("severe falls back to comment when pause is unsupported", async () => {
    const { actions, calls } = mockActions();
    const d = new InterventionDispatcher(actions);
    const result = await d.dispatch({
      targetAgentId: "a5",
      severity: "severe",
      content: "stop now",
      capabilities: FALLBACK_CAPS,
    });
    expect(result.kind).toBe("board_comment");
    expect(result.succeeded).toBe(true);
    expect(calls.map((c) => c.kind)).toEqual(["comment"]);
  });

  it("returns succeeded=false and an error kind when no dispatch path is available", async () => {
    const { actions, calls } = mockActions();
    const noCaps: AdapterCapabilities = {
      supportsInstructionsBundle: false,
      supportsBoardComment: false,
      supportsIssuePause: false,
      supportsIssueSplit: false,
    };
    const d = new InterventionDispatcher(actions);
    const result = await d.dispatch({
      targetAgentId: "a6",
      severity: "mild",
      content: "x",
      capabilities: noCaps,
    });
    expect(result.succeeded).toBe(false);
    expect(result.kind).toBe("no_capability");
    expect(calls).toEqual([]);
  });

  it("escalate splits the issue (severity=severe + capabilities allow split)", async () => {
    const { actions, calls } = mockActions();
    const d = new InterventionDispatcher(actions);
    const result = await d.escalate({
      targetAgentId: "a7",
      reason: "3 failed interventions",
      capabilities: FULL_CAPS,
    });
    expect(result.kind).toBe("split");
    expect(result.succeeded).toBe(true);
    expect(calls.map((c) => c.kind)).toEqual(["split"]);
    expect(calls[0].content).toBe("3 failed interventions");
  });

  it("escalate falls back to board comment when split unsupported", async () => {
    const { actions, calls } = mockActions();
    const d = new InterventionDispatcher(actions);
    const result = await d.escalate({
      targetAgentId: "a8",
      reason: "stuck",
      capabilities: FALLBACK_CAPS,
    });
    expect(result.kind).toBe("board_comment");
    expect(calls.map((c) => c.kind)).toEqual(["comment"]);
  });
});
