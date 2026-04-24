/**
 * Drizzle-backed implementation of the Psychologist's `IncidentStore`
 * port (spec §7.4, Group 7).
 *
 * Up to this point the psychologist package has been pure-ports; the
 * composition smoke test (Group 9 Task 50) used in-memory fakes. This
 * module wires the ports to the real `emotional_incidents` table so
 * psych interventions land in Postgres and the UI / CLI audit surfaces
 * see real data instead of empty arrays.
 *
 * Lives in the server package (not psychologist) to preserve the
 * psychologist package's zero-DB-dependency invariant from Group 7.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { emotionalIncidents } from "@petagent/db";
import type { IncidentRecord, IncidentStore } from "@petagent/psychologist";

export class DrizzleIncidentStore implements IncidentStore {
  constructor(private readonly db: Db) {}

  async insert(record: IncidentRecord): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(emotionalIncidents)
      .values({
        companyId: record.companyId,
        agentId: record.agentId,
        issueId: record.issueId ?? null,
        runId: record.runId ?? null,
        signalType: record.signalType,
        classification: record.classification,
        confidence: record.confidence,
        signalPayload: record.signalPayload,
        interventionKind: record.interventionKind,
        interventionPayload: record.interventionPayload,
        outcome: record.outcome,
      })
      .returning({ id: emotionalIncidents.id });
    if (!row) throw new Error("emotional_incidents insert returned no row");
    return { id: row.id };
  }

  async updateOutcome(
    id: string,
    outcome: IncidentRecord["outcome"],
    notes?: string,
  ): Promise<void> {
    await this.db
      .update(emotionalIncidents)
      .set({
        outcome,
        outcomeNotes: notes ?? null,
        outcomeResolvedAt: new Date(),
      })
      .where(eq(emotionalIncidents.id, id));
  }

  async recentForAgent(
    agentId: string,
    limit: number,
  ): Promise<Array<{ id: string; agentId: string; createdAt: Date }>> {
    const rows = await this.db
      .select({
        id: emotionalIncidents.id,
        agentId: emotionalIncidents.agentId,
        detectedAt: emotionalIncidents.detectedAt,
      })
      .from(emotionalIncidents)
      .where(eq(emotionalIncidents.agentId, agentId))
      .orderBy(desc(emotionalIncidents.detectedAt))
      .limit(Math.max(1, Math.min(500, limit)));
    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      createdAt: row.detectedAt ?? new Date(0),
    }));
  }

  async topSignalsForAgent(
    agentId: string,
    sinceDays: number,
  ): Promise<Array<{ signal: string; count: number }>> {
    const since = new Date(Date.now() - Math.max(1, sinceDays) * 24 * 60 * 60 * 1_000);
    // Aggregate signals[] inside signal_payload.classifier.signals
    const result = await this.db.execute<{ signal: string; count: number }>(sql`
      SELECT sig AS signal, COUNT(*)::int AS count
      FROM (
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(signal_payload -> 'classifier' -> 'signals') = 'array'
            THEN signal_payload -> 'classifier' -> 'signals'
            ELSE '[]'::jsonb
          END
        ) AS sig
        FROM ${emotionalIncidents}
        WHERE ${and(
          eq(emotionalIncidents.agentId, agentId),
          gte(emotionalIncidents.detectedAt, since),
        )}
      ) t
      GROUP BY sig
      ORDER BY count DESC, signal ASC
      LIMIT 20
    `);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
    return (rows as Array<{ signal: string; count: number | string }>).map((row) => ({
      signal: String(row.signal),
      count: Number(row.count),
    }));
  }
}
