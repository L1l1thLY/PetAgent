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
