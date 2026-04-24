/**
 * Drizzle-backed implementation of the Psychologist's
 * `BehavioralRecordsStore` port (Group 7, spec §7.2).
 *
 * Queries:
 *   - heartbeat_runs for recent-run status history (drives the
 *     consecutive-failures signal).
 *   - heartbeat_run_events for output samples (drives the
 *     output-length-collapse signal and the classifier's input).
 *   - tool-call structured events are not yet emitted by the heartbeat
 *     pipeline, so `recentToolCalls` returns an empty array. The
 *     BehaviorMonitor degrades gracefully when the tool signal has no
 *     data — it just skips the tool_error_rate branch without false
 *     positives. Populating this is a follow-up once the heartbeat
 *     pipeline emits tool events with a structured result shape.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { heartbeatRunEvents, heartbeatRuns } from "@petagent/db";
import type {
  BehavioralRecordsStore,
  OutputSample,
  RunSummary,
  ToolCallSample,
} from "@petagent/psychologist";

const MAX_LIMIT = 200;

function clamp(n: number): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(n)));
}

export class DrizzleBehavioralRecordsStore implements BehavioralRecordsStore {
  constructor(private readonly db: Db) {}

  async recentRuns(agentId: string, limit: number): Promise<RunSummary[]> {
    const rows = await this.db
      .select({
        status: heartbeatRuns.status,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
      })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, agentId))
      .orderBy(desc(heartbeatRuns.startedAt))
      .limit(clamp(limit));
    return rows.map((row) => ({
      status: row.status,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    }));
  }

  async recentOutputLengths(agentId: string, limit: number): Promise<number[]> {
    const outputs = await this.selectOutputRows(agentId, clamp(limit));
    return outputs.map((row) => (row.message ? row.message.length : 0));
  }

  async recentToolCalls(_agentId: string, _limit: number): Promise<ToolCallSample[]> {
    return [];
  }

  async recentOutputs(agentId: string, limit: number): Promise<OutputSample[]> {
    const rows = await this.selectOutputRows(agentId, clamp(limit));
    return rows.map((row) => ({
      text: row.message ?? "",
      length: row.message ? row.message.length : 0,
      createdAt: row.createdAt ?? new Date(0),
    }));
  }

  private async selectOutputRows(
    agentId: string,
    limit: number,
  ): Promise<Array<{ message: string | null; createdAt: Date | null }>> {
    return this.db
      .select({
        message: heartbeatRunEvents.message,
        createdAt: heartbeatRunEvents.createdAt,
      })
      .from(heartbeatRunEvents)
      .where(
        and(
          eq(heartbeatRunEvents.agentId, agentId),
          eq(heartbeatRunEvents.eventType, "output"),
        ),
      )
      .orderBy(desc(heartbeatRunEvents.createdAt))
      .limit(limit);
  }
}
