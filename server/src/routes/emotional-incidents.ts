import { Router } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { emotionalIncidents } from "@petagent/db";
import type { TransparencyGamma } from "@petagent/shared";
import { assertCompanyAccess } from "./authz.js";

const MIN_SINCE_DAYS = 1;
const MAX_SINCE_DAYS = 365;
const DEFAULT_SINCE_DAYS = 30;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

export function parseSinceDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SINCE_DAYS;
  return Math.max(MIN_SINCE_DAYS, Math.min(MAX_SINCE_DAYS, Math.trunc(n)));
}

export function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.trunc(n)));
}

export function windowStart(now: Date, sinceDays: number): Date {
  return new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000);
}

export interface IncidentRow {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  runId: string | null;
  detectedAt: Date | null;
  signalType: string;
  classification: string | null;
  confidence: number | null;
  signalPayload: Record<string, unknown> | null;
  interventionKind: string | null;
  interventionPayload: Record<string, unknown> | null;
  dispatchedAt: Date | null;
  outcome: string | null;
  outcomeNotes: string | null;
  outcomeResolvedAt: Date | null;
}

/**
 * Apply the configured transparency γ to a raw incident row (spec §7.4).
 *
 * - `opaque`   — redact intervention content AND classifier signals. The user
 *                sees the audit shape (ids, dates, outcome) but neither the
 *                agent-facing intervention text nor the behavioral details.
 *                Default for fresh installs.
 * - `semi`     — redact intervention content only. Classification, behavioral
 *                signal snapshot, and intervention *kind* are visible.
 * - `transparent` — return the row unchanged, including both payloads.
 */
export function applyGamma(row: IncidentRow, gamma: TransparencyGamma): IncidentRow {
  if (gamma === "transparent") return row;
  const opaque = gamma === "opaque";
  return {
    ...row,
    signalPayload: opaque ? redactPayload(row.signalPayload) : row.signalPayload,
    interventionPayload: redactPayload(row.interventionPayload),
  };
}

function redactPayload(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (payload === null) return null;
  return { redacted: true, note: "hidden by transparency policy (spec §7.4)" };
}

export interface EmotionalIncidentsRouteDeps {
  /** Returns the current transparency γ; called per-request so config reloads take effect. */
  getGamma: () => TransparencyGamma;
}

export function emotionalIncidentsRoutes(db: Db, deps: EmotionalIncidentsRouteDeps) {
  const router = Router();

  router.get("/companies/:companyId/emotional-incidents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const sinceDays = parseSinceDays(req.query.sinceDays);
    const limit = parseLimit(req.query.limit);
    const agentId =
      typeof req.query.agentId === "string" && req.query.agentId.length > 0
        ? (req.query.agentId as string)
        : undefined;
    const since = windowStart(new Date(), sinceDays);

    const conditions = [
      eq(emotionalIncidents.companyId, companyId),
      gte(emotionalIncidents.detectedAt, since),
    ];
    if (agentId) conditions.push(eq(emotionalIncidents.agentId, agentId));

    const rows = (await db
      .select({
        id: emotionalIncidents.id,
        companyId: emotionalIncidents.companyId,
        agentId: emotionalIncidents.agentId,
        issueId: emotionalIncidents.issueId,
        runId: emotionalIncidents.runId,
        detectedAt: emotionalIncidents.detectedAt,
        signalType: emotionalIncidents.signalType,
        classification: emotionalIncidents.classification,
        confidence: emotionalIncidents.confidence,
        signalPayload: emotionalIncidents.signalPayload,
        interventionKind: emotionalIncidents.interventionKind,
        interventionPayload: emotionalIncidents.interventionPayload,
        dispatchedAt: emotionalIncidents.dispatchedAt,
        outcome: emotionalIncidents.outcome,
        outcomeNotes: emotionalIncidents.outcomeNotes,
        outcomeResolvedAt: emotionalIncidents.outcomeResolvedAt,
      })
      .from(emotionalIncidents)
      .where(and(...conditions))
      .orderBy(desc(emotionalIncidents.detectedAt))
      .limit(limit)) as IncidentRow[];

    const gamma = deps.getGamma();
    res.json(rows.map((row) => applyGamma(row, gamma)));
  });

  return router;
}
