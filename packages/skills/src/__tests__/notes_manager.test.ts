import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitStore } from "@petagent/safety-net";
import { EmbeddingService } from "../embedding.js";
import { NotesManager } from "../notes_manager.js";

interface FakeRow {
  id: string;
  companyId: string;
  agentId: string;
  scope: string;
  body: string;
  noteType: string;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  embedding: number[] | null;
  gitCommitSha: string | null;
  issueId: string | null;
  sessionId: string | null;
  createdAt: Date;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

class FakeDb {
  rows: FakeRow[] = [];
  private nextId = 1;

  insert(_table: unknown) {
    return {
      values: (data: Partial<FakeRow> & Pick<FakeRow, "agentId" | "companyId" | "body">) => ({
        returning: async () => {
          const row: FakeRow = {
            id: `note-${this.nextId++}`,
            companyId: data.companyId,
            agentId: data.agentId,
            scope: data.scope ?? "project",
            body: data.body,
            noteType: data.noteType ?? "note",
            tags: data.tags ?? null,
            metadata: data.metadata ?? null,
            embedding: data.embedding ?? null,
            gitCommitSha: data.gitCommitSha ?? null,
            issueId: data.issueId ?? null,
            sessionId: data.sessionId ?? null,
            createdAt: new Date(Date.now() + this.nextId), // monotonic
          };
          this.rows.push(row);
          return [row];
        },
      }),
    };
  }

  select(_cols?: unknown) {
    const self = this;
    return {
      from: (_table: unknown) => ({
        where: (_predicate: unknown) => {
          let mode: "byId" | "list" = "byId";
          let _agentForList = "";
          const builder = {
            limit: async (n: number) => {
              if (mode === "byId") {
                // return any rows the call site asked for; production uses LIMIT 1
                return self.rows.slice(0, n);
              }
              return self.rows
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                .slice(0, n);
            },
            orderBy: (_o: unknown) => {
              mode = "list";
              return {
                limit: builder.limit,
              };
            },
          };
          void _agentForList;
          return builder;
        },
      }),
    };
  }

  async execute<T = unknown>(query: unknown): Promise<{ rows: T[] }> {
    // Drizzle's sql`` tag stores interpolated values inside queryChunks as the non-object elements.
    // SQL literal fragments are objects with { value: string[] }; nested sql`` calls are objects
    // with { queryChunks: [...] }. Actual parameter values are primitives (string, number) or arrays.
    // Parameter order for NotesManager.search:
    //   [0] vectorLiteral string  e.g. "[0.1,0.2,...]"
    //   [1] agentId
    //   [2] companyId
    //   [3] scope (only when scope filter is active)
    //   [-1] topK
    type SqlChunk = { value?: unknown[]; queryChunks?: SqlChunk[] } | unknown;
    function extractValues(chunks: SqlChunk[]): unknown[] {
      const vals: unknown[] = [];
      for (const chunk of chunks) {
        if (chunk !== null && typeof chunk === "object") {
          const c = chunk as { value?: unknown[]; queryChunks?: SqlChunk[] };
          if (Array.isArray(c.value)) continue; // SQL literal string fragment
          if (Array.isArray(c.queryChunks)) {
            vals.push(...extractValues(c.queryChunks)); // nested sql``
            continue;
          }
        }
        vals.push(chunk); // primitive bound parameter
      }
      return vals;
    }
    const q = query as { queryChunks?: SqlChunk[] };
    const args = q.queryChunks ? extractValues(q.queryChunks) : [];
    const vec0 = args[0];
    const queryVec = typeof vec0 === "string"
      ? JSON.parse(vec0) as number[]
      : (vec0 as number[]);
    const agentId = args[1] as string;
    const _companyId = args[2] as string;
    // args.length === 5 means scope filter is present: [vec, agentId, companyId, scope, topK]
    // args.length === 4 means no scope filter:          [vec, agentId, companyId, topK]
    const scope = args.length === 5 ? (args[3] as string) : null;
    const topK = args[args.length - 1] as number;
    const candidates = this.rows.filter((r) => {
      if (r.agentId !== agentId) return false;
      if (!r.embedding) return false;
      if (scope && r.scope !== scope) return false;
      return true;
    });
    const scored = candidates.map((r) => ({ row: r, dist: cosineDistance(queryVec, r.embedding!) }));
    scored.sort((a, b) => a.dist - b.dist);
    return { rows: scored.slice(0, topK).map((s) => ({ ...s.row, distance: s.dist })) as unknown as T[] };
  }
}

let tmpRoot: string;
let store: GitStore;
let db: FakeDb;
let embedder: EmbeddingService;
let mgr: NotesManager;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "petagent-notes-"));
  store = new GitStore({ rootDir: tmpRoot });
  await store.init();
  db = new FakeDb();
  embedder = new EmbeddingService();
  mgr = new NotesManager({
    db: db as unknown as never,
    embedder,
    store,
    companyId: "co-1",
  });
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("NotesManager.create", () => {
  it("writes file via GitStore + DB row, returns embedded record", async () => {
    const note = await mgr.create({
      agentId: "agent-1",
      content: "Vercel CLI auth via --token, not VERCEL_TOKEN env.",
      scope: "project",
      noteType: "lesson",
      tags: ["vercel", "deploy"],
    });
    expect(note.embedding).toHaveLength(1536);
    expect(note.gitCommitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(note.scope).toBe("project");
    expect(note.noteType).toBe("lesson");
    expect(note.content).toContain("Vercel CLI auth");
    expect(db.rows.length).toBe(1);
  });

  it("rejects an invalid scope", async () => {
    await expect(
      mgr.create({
        agentId: "agent-1",
        content: "x",
        // @ts-expect-error invalid scope on purpose
        scope: "global",
      }),
    ).rejects.toThrow(/scope/);
  });

  it("uses noteType=note when not provided", async () => {
    const note = await mgr.create({
      agentId: "agent-1",
      content: "default-typed note",
      scope: "user",
    });
    expect(note.noteType).toBe("note");
  });
});

describe("NotesManager.get", () => {
  it("returns null for unknown id", async () => {
    const result = await mgr.get("ghost");
    expect(result).toBeNull();
  });

  it("returns the record after create", async () => {
    const note = await mgr.create({ agentId: "agent-1", content: "x", scope: "project" });
    const fetched = await mgr.get(note.id);
    expect(fetched?.id).toBe(note.id);
  });
});

describe("NotesManager.list", () => {
  it("returns most-recent first, capped by limit", async () => {
    await mgr.create({ agentId: "agent-1", content: "first", scope: "project" });
    await mgr.create({ agentId: "agent-1", content: "second", scope: "project" });
    await mgr.create({ agentId: "agent-1", content: "third", scope: "project" });
    const out = await mgr.list({ agentId: "agent-1", limit: 2 });
    expect(out).toHaveLength(2);
    expect(out[0].content).toBe("third");
    expect(out[1].content).toBe("second");
  });

  it("uses default limit when omitted", async () => {
    for (let i = 0; i < 3; i++) {
      await mgr.create({ agentId: "agent-1", content: `n${i}`, scope: "project" });
    }
    const out = await mgr.list({ agentId: "agent-1" });
    expect(out.length).toBe(3);
  });
});

describe("NotesManager.search", () => {
  it("returns top-K ordered by cosine distance ascending", async () => {
    await mgr.create({ agentId: "agent-1", content: "vercel auth via --token", scope: "project" });
    await mgr.create({ agentId: "agent-1", content: "postgres requires SSL", scope: "project" });
    await mgr.create({ agentId: "agent-1", content: "render needs PORT env", scope: "project" });
    const results = await mgr.search({
      agentId: "agent-1",
      query: "vercel auth via --token",
      topK: 2,
    });
    expect(results).toHaveLength(2);
    expect(results[0].content).toContain("vercel");
  });

  it("honors scope filter", async () => {
    await mgr.create({ agentId: "agent-1", content: "global rule", scope: "user" });
    await mgr.create({ agentId: "agent-1", content: "project rule", scope: "project" });
    const results = await mgr.search({
      agentId: "agent-1",
      query: "rule",
      topK: 5,
      scope: "project",
    });
    expect(results.every((r) => r.scope === "project")).toBe(true);
  });

  it("excludes notes with NULL embedding", async () => {
    // simulate by inserting a row with embedding=null
    db.rows.push({
      id: "legacy-1",
      companyId: "co-1",
      agentId: "agent-1",
      scope: "project",
      body: "legacy m1 note",
      noteType: "note",
      tags: null,
      metadata: null,
      embedding: null,
      gitCommitSha: null,
      issueId: null,
      sessionId: null,
      createdAt: new Date(),
    });
    await mgr.create({ agentId: "agent-1", content: "embedded note", scope: "project" });
    const results = await mgr.search({ agentId: "agent-1", query: "note", topK: 5 });
    expect(results.find((r) => r.id === "legacy-1")).toBeUndefined();
  });
});
