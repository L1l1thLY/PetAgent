import type { Command } from "commander";
import type { Agent, HeartbeatRun, HeartbeatRunStatus } from "@petagent/shared";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

export interface HealthOptions extends BaseClientOptions {
  companyId?: string;
  limit?: string | number;
  sinceDays?: string | number;
}

export interface EmotionalIncidentSummary {
  id: string;
  agentId: string;
  severity?: string;
  classification?: string;
  detectedAt?: string | Date;
  outcome?: string;
}

export interface HealthSummary {
  agentCount: number;
  agentsByStatus: Record<string, number>;
  runsTotal: number;
  runsByStatus: Partial<Record<HeartbeatRunStatus, number>>;
  successRate: number;
  recentFailures: number;
  incidentsTotal: number;
  incidentsByClassification: Record<string, number>;
  incidentsByOutcome: Record<string, number>;
  incidentsAvailable: boolean;
}

export function summarizeHealth(
  agents: ReadonlyArray<Pick<Agent, "status">>,
  runs: ReadonlyArray<Pick<HeartbeatRun, "status">>,
  incidents: ReadonlyArray<EmotionalIncidentSummary> | null,
): HealthSummary {
  const agentsByStatus: Record<string, number> = {};
  for (const a of agents) {
    const key = a.status ?? "unknown";
    agentsByStatus[key] = (agentsByStatus[key] ?? 0) + 1;
  }

  const runsByStatus: Partial<Record<HeartbeatRunStatus, number>> = {};
  let recentFailures = 0;
  for (const r of runs) {
    runsByStatus[r.status] = (runsByStatus[r.status] ?? 0) + 1;
    if (r.status === "failed" || r.status === "timed_out") recentFailures += 1;
  }
  const finished = runs.filter(
    (r) =>
      r.status === "succeeded" ||
      r.status === "failed" ||
      r.status === "cancelled" ||
      r.status === "timed_out",
  ).length;
  const succeeded = runsByStatus.succeeded ?? 0;
  const successRate = finished === 0 ? 0 : succeeded / finished;

  const incidentsAvailable = incidents !== null;
  const incidentsByClassification: Record<string, number> = {};
  const incidentsByOutcome: Record<string, number> = {};
  if (incidents !== null) {
    for (const i of incidents) {
      const c = i.classification ?? i.severity ?? "unknown";
      incidentsByClassification[c] = (incidentsByClassification[c] ?? 0) + 1;
      const o = i.outcome ?? "pending";
      incidentsByOutcome[o] = (incidentsByOutcome[o] ?? 0) + 1;
    }
  }

  return {
    agentCount: agents.length,
    agentsByStatus,
    runsTotal: runs.length,
    runsByStatus,
    successRate,
    recentFailures,
    incidentsTotal: incidents?.length ?? 0,
    incidentsByClassification,
    incidentsByOutcome,
    incidentsAvailable,
  };
}

export function formatHealthSummary(s: HealthSummary, opts: { json?: boolean } = {}): string {
  if (opts.json) return JSON.stringify(s, null, 2);
  const lines: string[] = [];
  lines.push(`Agents: ${s.agentCount} total`);
  for (const [status, count] of Object.entries(s.agentsByStatus).sort()) {
    lines.push(`  ${status}: ${count}`);
  }
  lines.push("");
  lines.push(`Recent runs: ${s.runsTotal} sampled`);
  for (const [status, count] of Object.entries(s.runsByStatus).sort()) {
    lines.push(`  ${status}: ${count}`);
  }
  lines.push(`  success rate: ${(s.successRate * 100).toFixed(1)}%`);
  lines.push(`  recent failures: ${s.recentFailures}`);
  lines.push("");
  if (s.incidentsAvailable) {
    lines.push(`Emotional incidents: ${s.incidentsTotal}`);
    if (s.incidentsTotal > 0) {
      lines.push("  by classification:");
      for (const [k, v] of Object.entries(s.incidentsByClassification).sort()) {
        lines.push(`    ${k}: ${v}`);
      }
      lines.push("  by outcome:");
      for (const [k, v] of Object.entries(s.incidentsByOutcome).sort()) {
        lines.push(`    ${k}: ${v}`);
      }
    }
  } else {
    lines.push("Emotional incidents: (endpoint unavailable — skipping)");
  }
  return lines.join("\n");
}

async function fetchIncidentsOrNull(
  api: {
    get<T>(path: string): Promise<T | null>;
  },
  path: string,
): Promise<EmotionalIncidentSummary[] | null> {
  try {
    const out = await api.get<EmotionalIncidentSummary[]>(path);
    return out ?? [];
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status === 404) return null;
    throw err;
  }
}

export function registerHealthCommand(program: Command): void {
  addCommonClientOptions(
    program
      .command("health")
      .description(
        "Show a health summary for the current company (agents, recent heartbeat runs, emotional incidents).",
      )
      .requiredOption("-C, --company-id <id>", "Company ID")
      .option("--limit <n>", "Recent runs to sample (default 50)", (v) => Number(v))
      .option(
        "--since-days <n>",
        "Emotional-incident window in days (default 30)",
        (v) => Number(v),
      )
      .action(async (opts: HealthOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const limit = Number(opts.limit ?? 50);
          const sinceDays = Number(opts.sinceDays ?? 30);
          const agents =
            (await ctx.api.get<Agent[]>(`/api/companies/${ctx.companyId}/agents`)) ?? [];
          const runs =
            (await ctx.api.get<HeartbeatRun[]>(
              `/api/companies/${ctx.companyId}/heartbeat-runs?limit=${limit}`,
            )) ?? [];
          const incidents = await fetchIncidentsOrNull(
            ctx.api,
            `/api/companies/${ctx.companyId}/emotional-incidents?sinceDays=${sinceDays}`,
          );
          const summary = summarizeHealth(agents, runs, incidents);
          if (ctx.json) {
            printOutput(summary, { json: true });
            return;
          }
          console.log(formatHealthSummary(summary));
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
