import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  companies,
  createDb,
  eq,
  goals,
  issues,
  projects,
  projectWorkspaces,
} from "@petagent/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
  type EmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping workspace inheritance tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issue create — projectWorkspaceId inheritance via parent", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: EmbeddedPostgresTestDatabase | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("petagent-issues-workspace-inheritance-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("child issue inherits project primary workspace when parent has projectId but no projectWorkspaceId", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const workspaceId = randomUUID();
    const goalId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Test Co",
      issuePrefix: "T",
      issueCounter: 0,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CEO",
      role: "ceo",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Dev",
      status: "in_progress",
      urlKey: "dev",
    });
    await db.insert(projectWorkspaces).values({
      id: workspaceId,
      companyId,
      projectId,
      name: "main",
      sourceType: "local_path",
      cwd: "/tmp/fake-repo",
      isPrimary: true,
    });
    await db.insert(goals).values({
      id: goalId,
      companyId,
      title: "Goal",
    });

    const svc = issueService(db);

    // Parent: has projectId, no explicit projectWorkspaceId — service picks the primary workspace
    const parent = await svc.create(companyId, {
      title: "Parent task",
      projectId,
      goalId,
      assigneeAgentId: agentId,
    });
    expect(parent.projectWorkspaceId).toBe(workspaceId);

    // Child: only parentId, no projectId, no projectWorkspaceId
    const child = await svc.create(companyId, {
      title: "Child task",
      parentId: parent.id,
      goalId,
      assigneeAgentId: agentId,
    });

    expect(child.projectWorkspaceId).toBe(workspaceId);

    // Cleanup
    await db.delete(issues).where(eq(issues.companyId, companyId));
    await db.delete(projectWorkspaces);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(goals);
    await db.delete(companies);
  });

  it("child does not overwrite explicitly-set projectWorkspaceId", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const ws1Id = randomUUID();
    const ws2Id = randomUUID();
    const goalId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({ id: companyId, name: "Co2", issuePrefix: "C", issueCounter: 0 });
    await db.insert(agents).values({ id: agentId, companyId, name: "A", role: "ceo", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {} });
    await db.insert(projects).values({ id: projectId, companyId, name: "P", status: "in_progress", urlKey: "p" });
    await db.insert(projectWorkspaces).values([
      { id: ws1Id, companyId, projectId, name: "primary", sourceType: "local_path", cwd: "/tmp/ws1", isPrimary: true },
      { id: ws2Id, companyId, projectId, name: "secondary", sourceType: "local_path", cwd: "/tmp/ws2", isPrimary: false },
    ]);
    await db.insert(goals).values({ id: goalId, companyId, title: "G" });

    const svc = issueService(db);
    const parent = await svc.create(companyId, { title: "Parent", projectId, goalId, assigneeAgentId: agentId });

    const child = await svc.create(companyId, {
      title: "Child with explicit ws",
      parentId: parent.id,
      goalId,
      assigneeAgentId: agentId,
      projectWorkspaceId: ws2Id,
    });

    expect(child.projectWorkspaceId).toBe(ws2Id);
  });
});
