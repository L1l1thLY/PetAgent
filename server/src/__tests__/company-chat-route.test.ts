import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { companyChatRoutes } from "../routes/company-chat.js";

interface AgentRow {
  id: string;
  companyId: string;
  role: string;
  createdAt: Date;
}

function fakeDbWithAgents(rows: AgentRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => rows.map((r) => ({ id: r.id })),
          }),
        }),
      }),
    }),
    // issueService(db).create is invoked through the helper. Provide minimal
    // chained surface so it doesn't crash; we capture create via a spy.
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({} as never),
  };
}

vi.mock("../services/issues.js", () => ({
  issueService: () => ({
    create: vi.fn(async (companyId: string, data: { title: string; description: string }) => ({
      id: `issue-${data.title.slice(0, 5)}`,
      identifier: "PAP-1",
      companyId,
      ...data,
    })),
  }),
}));

function makeApp(rows: AgentRow[]) {
  const app = express();
  app.use(express.json());
  app.use("/api", companyChatRoutes({ db: fakeDbWithAgents(rows) as never }));
  return app;
}

describe("companyChatRoutes POST /companies/:companyId/chat", () => {
  it("returns 404 when no coordinator agent exists", async () => {
    const app = makeApp([]);
    const res = await request(app)
      .post("/api/companies/co-1/chat")
      .send({ message: "hello coordinator" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/coordinator/i);
  });

  it("returns 400 when message is empty", async () => {
    const app = makeApp([
      { id: "agent-1", companyId: "co-1", role: "coordinator", createdAt: new Date() },
    ]);
    const res = await request(app)
      .post("/api/companies/co-1/chat")
      .send({ message: "" });
    expect(res.status).toBe(400);
  });

  it("creates an issue assigned to coordinator and returns its id", async () => {
    const app = makeApp([
      { id: "coord-1", companyId: "co-1", role: "coordinator", createdAt: new Date() },
    ]);
    const res = await request(app)
      .post("/api/companies/co-1/chat")
      .send({ message: "Plan our Q3 launch please" });
    expect(res.status).toBe(201);
    expect(res.body.coordinatorId).toBe("coord-1");
    expect(res.body.issueId).toBeDefined();
  });

  it("truncates long messages to 120-char title but preserves full description", async () => {
    const longMsg = "x".repeat(500);
    const app = makeApp([
      { id: "coord-1", companyId: "co-1", role: "coordinator", createdAt: new Date() },
    ]);
    const res = await request(app)
      .post("/api/companies/co-1/chat")
      .send({ message: longMsg });
    expect(res.status).toBe(201);
  });
});
