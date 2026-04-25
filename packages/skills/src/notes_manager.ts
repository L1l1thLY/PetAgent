/**
 * NotesManager — agent-authored notes with GitStore + DB persistence
 * and pgvector-backed semantic retrieval (M2 spec §4 Notes layer).
 *
 * `create` writes a markdown file via `GitStore.writeFile` BEFORE the
 * DB insert. If the DB insert fails, the git history retains an
 * orphan commit — git is append-only and we don't try to compensate.
 * If the file write fails, no DB row is created.
 *
 * `search` (Task 3) uses pgvector cosine distance on the `embedding`
 * column from the M1+Task-0 schema.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agentNotes } from "@petagent/db";
import type { GitStore } from "@petagent/safety-net";
import type { EmbeddingService } from "./embedding.js";

export type NoteScope = "user" | "project" | "local";

const VALID_SCOPES: ReadonlySet<NoteScope> = new Set(["user", "project", "local"]);

export interface CreateNoteArgs {
  agentId: string;
  content: string;
  scope: NoteScope;
  tags?: string[];
  noteType?: string;
  sourceIssueId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NoteRecord {
  id: string;
  agentId: string;
  companyId: string;
  scope: NoteScope;
  noteType: string;
  content: string;
  tags: string[];
  embedding: number[] | null;
  gitCommitSha: string | null;
  sourceIssueId: string | null;
  sessionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface NotesManagerDeps {
  db: Db;
  embedder: EmbeddingService;
  store: GitStore;
  companyId: string;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export class NotesManager {
  private readonly db: Db;
  private readonly embedder: EmbeddingService;
  private readonly store: GitStore;
  private readonly companyId: string;

  constructor(deps: NotesManagerDeps) {
    this.db = deps.db;
    this.embedder = deps.embedder;
    this.store = deps.store;
    this.companyId = deps.companyId;
  }

  async create(args: CreateNoteArgs): Promise<NoteRecord> {
    if (!VALID_SCOPES.has(args.scope)) {
      throw new Error(`NotesManager.create: invalid scope '${args.scope}'`);
    }
    const noteType = args.noteType ?? "note";
    const tags = args.tags ?? [];
    const metadata = args.metadata ?? {};
    const embedding = await this.embedder.embed(args.content);
    const today = new Date().toISOString().slice(0, 10);
    const slug = slugify(args.content).slice(0, 40);
    const filename = `${today}-${slug || "note"}.md`;
    const relPath = `agents/${args.agentId}/notes/${filename}`;
    const body = renderMarkdown(args, noteType, tags);
    const message = `note(${args.scope}/${noteType}): ${args.content.slice(0, 60)}${args.content.length > 60 ? "..." : ""}`;
    const written = await this.store.writeFile(relPath, body, message);
    const [row] = await this.db
      .insert(agentNotes)
      .values({
        companyId: this.companyId,
        agentId: args.agentId,
        issueId: args.sourceIssueId ?? null,
        sessionId: args.sessionId ?? null,
        noteType,
        body: args.content,
        tags,
        metadata,
        gitCommitSha: written.sha,
        embedding,
        scope: args.scope,
      })
      .returning();
    return rowToRecord(row as unknown as RawRow);
  }

  async get(id: string): Promise<NoteRecord | null> {
    const rows = await this.db
      .select()
      .from(agentNotes)
      .where(eq(agentNotes.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.companyId !== this.companyId) return null;
    return rowToRecord(row as unknown as RawRow);
  }

  async list(args: { agentId: string; limit?: number }): Promise<NoteRecord[]> {
    const limit = clamp(args.limit ?? DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
    const rows = await this.db
      .select()
      .from(agentNotes)
      .where(and(eq(agentNotes.agentId, args.agentId), eq(agentNotes.companyId, this.companyId)))
      .orderBy(desc(agentNotes.createdAt))
      .limit(limit);
    return rows.map((r) => rowToRecord(r as unknown as RawRow));
  }

  async search(args: {
    agentId: string;
    query: string;
    topK?: number;
    scope?: NoteScope;
  }): Promise<NoteRecord[]> {
    const topK = clamp(args.topK ?? 10, 1, 50);
    const queryVec = await this.embedder.embed(args.query);
    const vectorLiteral = `[${queryVec.join(",")}]`;
    const scopeFilter = args.scope ?? null;
    const result = await this.db.execute(sql`
      SELECT
        id, company_id AS "companyId", agent_id AS "agentId",
        scope, note_type AS "noteType", body, tags, metadata,
        embedding, git_commit_sha AS "gitCommitSha",
        issue_id AS "issueId", session_id AS "sessionId",
        created_at AS "createdAt",
        embedding <=> ${vectorLiteral}::vector AS distance
      FROM agent_notes
      WHERE agent_id = ${args.agentId}
        AND company_id = ${this.companyId}
        AND embedding IS NOT NULL
        ${scopeFilter ? sql`AND scope = ${scopeFilter}` : sql``}
      ORDER BY distance ASC
      LIMIT ${topK}
    `);
    const rows = Array.isArray(result) ? (result as unknown as RawRow[]) : (result as { rows?: RawRow[] }).rows ?? [];
    return rows.map((r) => rowToRecord(r));
  }
}

interface RawRow {
  id: string;
  companyId: string;
  agentId: string;
  scope: string;
  noteType: string;
  body: string;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  embedding: number[] | null;
  gitCommitSha: string | null;
  issueId: string | null;
  sessionId: string | null;
  createdAt: Date | null;
}

function rowToRecord(row: RawRow): NoteRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    companyId: row.companyId,
    scope: (row.scope as NoteScope) ?? "project",
    noteType: row.noteType,
    content: row.body,
    tags: row.tags ?? [],
    embedding: row.embedding ?? null,
    gitCommitSha: row.gitCommitSha,
    sourceIssueId: row.issueId,
    sessionId: row.sessionId,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt ?? new Date(0),
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderMarkdown(args: CreateNoteArgs, noteType: string, tags: string[]): string {
  const fm = [
    "---",
    `noteType: ${noteType}`,
    `scope: ${args.scope}`,
    `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`,
    args.sourceIssueId ? `sourceIssueId: ${args.sourceIssueId}` : null,
    args.sessionId ? `sessionId: ${args.sessionId}` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");
  return `${fm}\n\n${args.content}\n`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
