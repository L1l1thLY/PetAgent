import { describe, it, expect } from "vitest";
import { ServicePsychologistActions } from "../psychologist/service_psychologist_actions.js";

interface AgentRow {
  id: string;
  companyId: string;
  name: string;
  adapterConfig: Record<string, unknown>;
}

interface IssueRow {
  id: string;
  companyId: string;
  status: string;
  assigneeAgentId: string | null;
  projectId: string | null;
  goalId: string | null;
  updatedAt: Date;
}

interface CommentRecord {
  issueId: string;
  body: string;
  agentId?: string;
  userId?: string;
  runId: string | null;
}

interface IssueCreateInput {
  title: string;
  description?: string;
  parentId?: string;
  projectId?: string | null;
  goalId?: string | null;
  status?: string;
}

class FakeIssueService {
  comments: CommentRecord[] = [];
  updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  created: Array<{ companyId: string; data: IssueCreateInput }> = [];
  forceTransitionRejection = false;

  constructor(private readonly issues: IssueRow[]) {}

  async addComment(issueId: string, body: string, actor: { agentId?: string; userId?: string; runId?: string | null }) {
    this.comments.push({ issueId, body, agentId: actor.agentId, userId: actor.userId, runId: actor.runId ?? null });
    return { id: `c-${this.comments.length}`, body };
  }

  async update(id: string, data: Record<string, unknown>) {
    if (this.forceTransitionRejection && data.status && data.status !== "in_progress") {
      const err = new Error("Invalid status transition");
      (err as Error & { statusCode?: number }).statusCode = 422;
      throw err;
    }
    this.updates.push({ id, data });
    const existing = this.issues.find((i) => i.id === id);
    if (!existing) return null;
    return { ...existing, ...data };
  }

  async create(companyId: string, data: IssueCreateInput) {
    this.created.push({ companyId, data });
    const newId = `new-${this.created.length}`;
    return { id: newId, identifier: `NEW-${this.created.length}`, companyId, ...data };
  }
}

class FakeAgentInstructions {
  writes: Array<{ agentId: string; relativePath: string; content: string }> = [];
  async writeFile(
    agent: AgentRow,
    relativePath: string,
    content: string,
  ) {
    this.writes.push({ agentId: agent.id, relativePath, content });
    return { bundle: {}, file: {}, adapterConfig: {} } as unknown;
  }
}

interface FakeDeps {
  agents: AgentRow[];
  issues: IssueRow[];
}

function makeFakeDb(state: FakeDeps) {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: (table: { _: { name?: string } } & Record<string, unknown>) => ({
        where: () => ({
          limit: async () => {
            // crude: route by which column set was selected
            if (cols && "adapterConfig" in cols) {
              return state.agents;
            }
            return state.issues;
          },
          orderBy: () => ({
            limit: async () => state.issues,
          }),
        }),
      }),
    }),
  } as unknown as import("@petagent/db").Db;
}

const makeWarnLogger = () => {
  const warnings: Array<{ msg: string; meta?: unknown }> = [];
  return {
    logger: { warn: (msg: string, meta?: unknown) => warnings.push({ msg, meta }) },
    warnings,
  };
};

const makeAgent = (overrides: Partial<AgentRow> = {}): AgentRow => ({
  id: "agent-1",
  companyId: "co-1",
  name: "Sigmund",
  adapterConfig: {},
  ...overrides,
});

const makeIssue = (overrides: Partial<IssueRow> = {}): IssueRow => ({
  id: "issue-1",
  companyId: "co-1",
  status: "in_progress",
  assigneeAgentId: "agent-1",
  projectId: "proj-1",
  goalId: "goal-1",
  updatedAt: new Date("2026-04-25T00:00:00Z"),
  ...overrides,
});

describe("ServicePsychologistActions.injectInstructions", () => {
  it("writes the configured filename with the provided content", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const { logger } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await actions.injectInstructions("agent-1", "Take a deep breath.");
    expect(agentInstructions.writes).toEqual([
      { agentId: "agent-1", relativePath: "psychologist-injection.md", content: "Take a deep breath." },
    ]);
  });

  it("respects an injected injectionFileName", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      injectionFileName: "custom/path.md",
    });
    await actions.injectInstructions("agent-1", "hi");
    expect(agentInstructions.writes[0].relativePath).toBe("custom/path.md");
  });

  it("warns and no-ops when the agent is missing", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await expect(actions.injectInstructions("ghost", "x")).resolves.toBeUndefined();
    expect(agentInstructions.writes).toEqual([]);
    expect(warnings.length).toBe(1);
  });

  it("does not throw when writeFile rejects", async () => {
    const issueService = new FakeIssueService([]);
    const failing = new FakeAgentInstructions();
    failing.writeFile = async () => {
      throw new Error("disk full");
    };
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: failing as unknown as never,
      logger,
    });
    await expect(actions.injectInstructions("agent-1", "x")).resolves.toBeUndefined();
    expect(warnings.length).toBe(1);
  });
});
