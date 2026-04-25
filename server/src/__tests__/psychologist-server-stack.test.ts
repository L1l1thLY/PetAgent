import { describe, it, expect } from "vitest";
import { InterventionDispatcher } from "@petagent/psychologist";
import {
  PSYCH_CAPABILITY_DEFAULTS,
  PSYCH_CAPABILITY_FALLBACK,
} from "../psychologist/psych_capability_registry.js";
import { ServicePsychologistActions } from "../psychologist/service_psychologist_actions.js";

describe("server-stack PsychologistActions composition", () => {
  it("routes a moderate intervention through dispatcher → inject + board comment via the service layer", async () => {
    interface IssueRow {
      id: string;
      companyId: string;
      status: string;
      assigneeAgentId: string | null;
      projectId: string | null;
      goalId: string | null;
      updatedAt: Date;
    }
    const agent = {
      id: "agent-1",
      companyId: "co-1",
      name: "Sigmund",
      adapterConfig: {},
      adapterType: "petagent",
    };
    const issueRow: IssueRow = {
      id: "issue-1",
      companyId: "co-1",
      status: "in_progress",
      assigneeAgentId: "agent-1",
      projectId: "proj-1",
      goalId: "goal-1",
      updatedAt: new Date(),
    };

    const writes: Array<{ relativePath: string; content: string }> = [];
    const comments: Array<{ issueId: string; body: string; agentId?: string }> = [];

    const fakeDb = {
      select: (cols?: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            limit: async () => (cols && "adapterConfig" in cols ? [agent] : [issueRow]),
            orderBy: () => ({ limit: async () => [issueRow] }),
          }),
        }),
      }),
    } as unknown as never;

    const fakeIssueService = {
      addComment: async (issueId: string, body: string, actor: { agentId?: string }) => {
        comments.push({ issueId, body, agentId: actor.agentId });
        return { id: "c-1", body };
      },
      update: async () => issueRow,
      create: async () => ({ id: "new-1", identifier: "NEW-1" }),
    };

    const fakeAgentInstructions = {
      writeFile: async (
        _agent: typeof agent,
        relativePath: string,
        content: string,
      ) => {
        writes.push({ relativePath, content });
        return {} as unknown;
      },
    };

    const actions = new ServicePsychologistActions({
      db: fakeDb,
      issueService: fakeIssueService,
      agentInstructions: fakeAgentInstructions,
      systemActorAgentId: "psych-1",
    });
    const dispatcher = new InterventionDispatcher(actions);

    // Capability check: petagent native gets the full set
    expect(PSYCH_CAPABILITY_DEFAULTS.petagent.supportsInstructionsBundle).toBe(true);
    expect(PSYCH_CAPABILITY_DEFAULTS.petagent.supportsBoardComment).toBe(true);
    expect(PSYCH_CAPABILITY_FALLBACK.supportsBoardComment).toBe(true);

    const result = await dispatcher.dispatch({
      targetAgentId: "agent-1",
      severity: "moderate",
      content: "metacognitive prompt",
      capabilities: PSYCH_CAPABILITY_DEFAULTS.petagent,
    });

    expect(result).toEqual({ kind: "instructions_inject_with_comment", succeeded: true });
    expect(writes).toEqual([
      { relativePath: "psychologist-injection.md", content: "metacognitive prompt" },
    ]);
    expect(comments).toEqual([
      { issueId: "issue-1", body: "metacognitive prompt", agentId: "psych-1" },
    ]);
  });

  it("routes severe intervention through pause when capability is granted", async () => {
    const issueRow = {
      id: "issue-2",
      companyId: "co-1",
      status: "in_progress",
      assigneeAgentId: "agent-2",
      projectId: null,
      goalId: null,
      updatedAt: new Date(),
    };
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const comments: Array<{ issueId: string; body: string }> = [];

    const fakeDb = {
      select: (cols?: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              cols && "adapterConfig" in cols
                ? [{ id: "agent-2", companyId: "co-1", name: "Anna", adapterConfig: {} }]
                : [issueRow],
            orderBy: () => ({ limit: async () => [issueRow] }),
          }),
        }),
      }),
    } as unknown as never;

    const fakeIssueService = {
      addComment: async (issueId: string, body: string) => {
        comments.push({ issueId, body });
        return { id: "c-1", body };
      },
      update: async (id: string, data: Record<string, unknown>) => {
        updates.push({ id, data });
        return issueRow;
      },
      create: async () => ({ id: "x", identifier: "X-1" }),
    };

    const fakeAgentInstructions = {
      writeFile: async () => ({}) as unknown,
    };

    const actions = new ServicePsychologistActions({
      db: fakeDb,
      issueService: fakeIssueService,
      agentInstructions: fakeAgentInstructions,
    });
    const dispatcher = new InterventionDispatcher(actions);

    const result = await dispatcher.dispatch({
      targetAgentId: "agent-2",
      severity: "severe",
      content: "stop and breathe",
      capabilities: PSYCH_CAPABILITY_DEFAULTS.petagent,
    });

    expect(result.kind).toBe("pause_therapy");
    expect(updates).toEqual([
      { id: "issue-2", data: { status: "blocked", actorAgentId: null } },
    ]);
    expect(comments[0].body).toBe("Paused for therapy session.");
  });
});
