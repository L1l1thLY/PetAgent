import type { Command } from "commander";
import type { Agent } from "@petagent/shared";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

export interface StatusCliOptions extends BaseClientOptions {
  companyId?: string;
  /** Override the reference time (primarily for tests). */
  nowIso?: string;
}

export interface IssueLike {
  status: string;
  updatedAt?: string | Date | null;
  title?: string;
  identifier?: string;
}

export interface IncidentLike {
  classification?: string | null;
  severity?: string | null;
  detectedAt?: string | Date | null;
}

export interface DashboardLike {
  company?: {
    budgetMonthlyCents?: number;
    spentMonthlyCents?: number;
    utilization?: number;
  };
  monthSpendCents?: number;
  budgetUtilization?: number;
}

export interface StatusSummary {
  companyId: string;
  windowStart: string;
  windowEnd: string;
  issuesCompletedToday: number;
  issuesHighlightedToday: Array<{ identifier?: string; title?: string }>;
  interventionsToday: number;
  interventionsBySeverity: Record<string, number>;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  budgetUtilizationPercent: number;
  agentCount: number;
  agentsByStatus: Record<string, number>;
  agentsOverBudget: Array<{ id: string; name: string; utilizationPercent: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function parseIsoOrDate(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function summarizeStatus(input: {
  companyId: string;
  now: Date;
  agents: ReadonlyArray<Pick<Agent, "id" | "name" | "status" | "budgetMonthlyCents" | "spentMonthlyCents">>;
  issues: ReadonlyArray<IssueLike>;
  incidents: ReadonlyArray<IncidentLike>;
  dashboard?: DashboardLike | null;
}): StatusSummary {
  const { companyId, now, agents, issues, incidents, dashboard } = input;
  const windowStart = startOfDay(now);
  const windowEnd = new Date(windowStart.getTime() + DAY_MS);

  const completedToday: IssueLike[] = [];
  for (const issue of issues) {
    const updated = parseIsoOrDate(issue.updatedAt);
    if (!updated) continue;
    if (issue.status !== "done") continue;
    if (updated.getTime() < windowStart.getTime() || updated.getTime() >= windowEnd.getTime()) continue;
    completedToday.push(issue);
  }

  const interventionsToday: IncidentLike[] = [];
  for (const incident of incidents) {
    const detected = parseIsoOrDate(incident.detectedAt);
    if (!detected) continue;
    if (detected.getTime() < windowStart.getTime() || detected.getTime() >= windowEnd.getTime()) continue;
    interventionsToday.push(incident);
  }
  const interventionsBySeverity: Record<string, number> = {};
  for (const i of interventionsToday) {
    const key = (i.classification ?? i.severity ?? "unknown") as string;
    interventionsBySeverity[key] = (interventionsBySeverity[key] ?? 0) + 1;
  }

  let agentsByStatus: Record<string, number> = {};
  for (const a of agents) {
    const key = a.status ?? "unknown";
    agentsByStatus[key] = (agentsByStatus[key] ?? 0) + 1;
  }

  const agentsOverBudget: StatusSummary["agentsOverBudget"] = [];
  for (const a of agents) {
    const budget = Number(a.budgetMonthlyCents ?? 0);
    const spent = Number(a.spentMonthlyCents ?? 0);
    if (budget <= 0) continue;
    const util = spent / budget;
    if (util < 0.9) continue;
    agentsOverBudget.push({
      id: a.id,
      name: a.name,
      utilizationPercent: Math.round(util * 1000) / 10,
    });
  }

  const companyBudget = Number(dashboard?.company?.budgetMonthlyCents ?? 0);
  const companySpent =
    Number(dashboard?.company?.spentMonthlyCents ?? dashboard?.monthSpendCents ?? 0);
  const utilization =
    companyBudget > 0
      ? (companySpent / companyBudget) * 100
      : Number(dashboard?.budgetUtilization ?? 0) * 100;

  return {
    companyId,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    issuesCompletedToday: completedToday.length,
    issuesHighlightedToday: completedToday.slice(0, 5).map((i) => ({
      identifier: i.identifier,
      title: i.title,
    })),
    interventionsToday: interventionsToday.length,
    interventionsBySeverity,
    budgetMonthlyCents: companyBudget,
    spentMonthlyCents: companySpent,
    budgetUtilizationPercent: Math.round(utilization * 10) / 10,
    agentCount: agents.length,
    agentsByStatus,
    agentsOverBudget,
  };
}

export function formatStatus(summary: StatusSummary, opts: { json?: boolean } = {}): string {
  if (opts.json) return JSON.stringify(summary, null, 2);
  const lines: string[] = [];
  lines.push(`Company: ${summary.companyId}`);
  lines.push(`Window: ${summary.windowStart.slice(0, 10)} (local day)`);
  lines.push("");
  lines.push(`Today`);
  lines.push(`  Completed issues: ${summary.issuesCompletedToday}`);
  if (summary.issuesHighlightedToday.length > 0) {
    for (const i of summary.issuesHighlightedToday) {
      const id = i.identifier ? `[${i.identifier}] ` : "";
      lines.push(`    ${id}${i.title ?? "(untitled)"}`);
    }
  }
  lines.push(`  Emotional interventions: ${summary.interventionsToday}`);
  for (const [k, v] of Object.entries(summary.interventionsBySeverity).sort()) {
    lines.push(`    ${k}: ${v}`);
  }
  lines.push("");
  lines.push(`Budget (month-to-date)`);
  lines.push(`  Company spent: $${cents(summary.spentMonthlyCents)} / $${cents(summary.budgetMonthlyCents)}`);
  lines.push(`  Utilization: ${summary.budgetUtilizationPercent.toFixed(1)}%`);
  if (summary.agentsOverBudget.length > 0) {
    lines.push(`  Agents ≥90% of their monthly budget:`);
    for (const a of summary.agentsOverBudget) {
      lines.push(`    ${a.name} (${a.id.slice(0, 8)}): ${a.utilizationPercent.toFixed(1)}%`);
    }
  }
  lines.push("");
  lines.push(`Agents: ${summary.agentCount}`);
  for (const [status, count] of Object.entries(summary.agentsByStatus).sort()) {
    lines.push(`  ${status}: ${count}`);
  }
  return lines.join("\n");
}

function cents(n: number): string {
  return (Math.round(n) / 100).toFixed(2);
}

export function registerStatusCommand(program: Command): void {
  addCommonClientOptions(
    program
      .command("status")
      .description("Show today's activity summary (issues, interventions, budget, agents).")
      .requiredOption("-C, --company-id <id>", "Company ID")
      .action(async (opts: StatusCliOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const now = opts.nowIso ? new Date(opts.nowIso) : new Date();

          const [agents, issues, incidents, dashboard] = await Promise.all([
            ctx.api
              .get<Agent[]>(`/api/companies/${ctx.companyId}/agents`)
              .then((x) => x ?? []),
            ctx.api
              .get<IssueLike[]>(`/api/companies/${ctx.companyId}/issues?limit=500`)
              .then((x) => x ?? []),
            ctx.api
              .get<IncidentLike[]>(
                `/api/companies/${ctx.companyId}/emotional-incidents?sinceDays=1&limit=200`,
              )
              .then((x) => x ?? [])
              .catch((err) => {
                const status = (err as { status?: number } | null)?.status;
                if (status === 404) return [];
                throw err;
              }),
            ctx.api
              .get<DashboardLike>(`/api/companies/${ctx.companyId}/dashboard`)
              .catch(() => null),
          ]);

          const summary = summarizeStatus({
            companyId: ctx.companyId ?? "",
            now,
            agents,
            issues,
            incidents,
            dashboard,
          });

          if (ctx.json) {
            printOutput(summary, { json: true });
            return;
          }
          console.log(formatStatus(summary));
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
