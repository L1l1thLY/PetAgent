import { Router } from "express";
import { z } from "zod";
import type { Db } from "@petagent/db";
import { agentNotes } from "@petagent/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { createEmbeddingService } from "../composition/embedding.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  scope: z.enum(["user", "project", "local"]).optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1),
  topK: z.coerce.number().int().positive().max(50).optional(),
  scope: z.enum(["user", "project", "local"]).optional(),
});

interface RawNoteRow {
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

function rowToResponse(row: RawNoteRow) {
  return {
    id: row.id,
    companyId: row.companyId,
    agentId: row.agentId,
    scope: row.scope,
    noteType: row.noteType,
    content: row.body,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    gitCommitSha: row.gitCommitSha,
    sourceIssueId: row.issueId,
    sessionId: row.sessionId,
    createdAt: row.createdAt,
  };
}

export function agentNotesRoutes(db: Db): Router {
  const router = Router();

  router.get("/companies/:companyId/agents/:agentId/notes", async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
      return;
    }
    const { companyId, agentId } = req.params;
    const limit = parsed.data.limit ?? 50;
    const conditions = [eq(agentNotes.companyId, companyId), eq(agentNotes.agentId, agentId)];
    if (parsed.data.scope) {
      conditions.push(eq(agentNotes.scope, parsed.data.scope));
    }
    const rows = await db
      .select()
      .from(agentNotes)
      .where(and(...conditions))
      .orderBy(desc(agentNotes.createdAt))
      .limit(limit);
    res.json(rows.map((r) => rowToResponse(r as unknown as RawNoteRow)));
  });

  router.get("/companies/:companyId/agents/:agentId/notes/search", async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
      return;
    }
    const { companyId, agentId } = req.params;
    const topK = parsed.data.topK ?? 10;
    const embedder = createEmbeddingService(process.env).service;
    const queryVec = await embedder.embed(parsed.data.q);
    const vectorLiteral = `[${queryVec.join(",")}]`;
    const scopeFilter = parsed.data.scope ?? null;
    const result = await db.execute(sql`
      SELECT
        id, company_id AS "companyId", agent_id AS "agentId",
        scope, note_type AS "noteType", body, tags, metadata,
        embedding, git_commit_sha AS "gitCommitSha",
        issue_id AS "issueId", session_id AS "sessionId",
        created_at AS "createdAt",
        embedding <=> ${vectorLiteral}::vector AS distance
      FROM agent_notes
      WHERE agent_id = ${agentId}
        AND company_id = ${companyId}
        AND embedding IS NOT NULL
        ${scopeFilter ? sql`AND scope = ${scopeFilter}` : sql``}
      ORDER BY distance ASC
      LIMIT ${topK}
    `);
    const rows = Array.isArray(result) ? (result as unknown as RawNoteRow[]) : (result as { rows?: RawNoteRow[] }).rows ?? [];
    res.json(rows.map((r) => rowToResponse(r)));
  });

  router.get("/notes/:id", async (req, res) => {
    const rows = await db
      .select()
      .from(agentNotes)
      .where(eq(agentNotes.id, req.params.id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    res.json(rowToResponse(row as unknown as RawNoteRow));
  });

  return router;
}
