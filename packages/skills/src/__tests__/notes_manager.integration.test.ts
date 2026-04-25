import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createDb,
  companies,
  agentNotes,
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
  type EmbeddedPostgresTestDatabase,
} from "@petagent/db";
import { sql } from "drizzle-orm";
import { GitStore } from "@petagent/safety-net";
import { EmbeddingService } from "../embedding.js";
import { NotesManager } from "../notes_manager.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbedded = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbedded("NotesManager — real pgvector integration", () => {
  let tempDb: EmbeddedPostgresTestDatabase | null = null;
  let db!: ReturnType<typeof createDb>;
  let tmpRoot: string;
  let store: GitStore;
  let mgr: NotesManager;
  const companyId = randomUUID();

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("petagent-notes-integration-");
    db = createDb(tempDb.connectionString);
    await db.insert(companies).values({
      id: companyId,
      name: "PetAgent Notes Integration",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    });
    tmpRoot = await mkdtemp(join(tmpdir(), "petagent-notes-integration-"));
    store = new GitStore({ rootDir: tmpRoot });
    await store.init();
    mgr = new NotesManager({
      db,
      embedder: new EmbeddingService(),
      store,
      companyId,
    });
  }, 60_000);

  afterAll(async () => {
    await tempDb?.cleanup();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("creates 5 notes and ranks them by semantic similarity", async () => {
    const agentId = randomUUID();
    const corpus = [
      "Vercel CLI auth via --token, not VERCEL_TOKEN env.",
      "Postgres requires SSL in production.",
      "Render needs the PORT env to bind correctly.",
      "Always run prisma migrate before deploying.",
      "Fly.io uses TOML for deploy config.",
    ];
    for (const content of corpus) {
      await mgr.create({ agentId, content, scope: "project" });
    }
    const results = await mgr.search({
      agentId,
      query: "Vercel CLI auth via --token, not VERCEL_TOKEN env.",
      topK: 3,
    });
    expect(results).toHaveLength(3);
    expect(results[0].content).toContain("Vercel");
  });

  it("scope filter excludes other-scope notes", async () => {
    const agentId = randomUUID();
    await mgr.create({ agentId, content: "user-level rule", scope: "user" });
    await mgr.create({ agentId, content: "project-level rule", scope: "project" });
    const results = await mgr.search({
      agentId,
      query: "rule",
      topK: 5,
      scope: "project",
    });
    expect(results.every((r) => r.scope === "project")).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes notes with NULL embedding", async () => {
    const agentId = randomUUID();
    const legacyId = randomUUID();
    await db.execute(sql`
      INSERT INTO agent_notes (id, company_id, agent_id, scope, note_type, body)
      VALUES (${legacyId}, ${companyId}, ${agentId}, 'project', 'note', 'legacy m1 note without embedding')
    `);
    await mgr.create({ agentId, content: "embedded note about deployment", scope: "project" });
    const results = await mgr.search({ agentId, query: "note", topK: 5 });
    expect(results.find((r) => r.id === legacyId)).toBeUndefined();
  });

  it("get returns the row after create round-trip", async () => {
    const agentId = randomUUID();
    const created = await mgr.create({
      agentId,
      content: "round-trip test",
      scope: "project",
    });
    const fetched = await mgr.get(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.content).toBe("round-trip test");
    expect(fetched?.embedding).toHaveLength(1536);
    expect(fetched?.gitCommitSha).toMatch(/^[a-f0-9]{40}$/);
  });

  it("list returns most-recent-first scoped to companyId + agentId", async () => {
    const agentId = randomUUID();
    await mgr.create({ agentId, content: "first", scope: "project" });
    await new Promise((r) => setTimeout(r, 5));
    await mgr.create({ agentId, content: "second", scope: "project" });
    await new Promise((r) => setTimeout(r, 5));
    await mgr.create({ agentId, content: "third", scope: "project" });
    const out = await mgr.list({ agentId, limit: 2 });
    expect(out).toHaveLength(2);
    expect(out[0].content).toBe("third");
    expect(out[1].content).toBe("second");
    // Confirm a row exists in DB at all (sanity)
    const direct = await db.select().from(agentNotes).limit(1);
    expect(direct.length).toBeGreaterThan(0);
  });
});
