import type { Command } from "commander";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

export interface AuditOptions extends BaseClientOptions {
  companyId?: string;
  sinceDays?: string | number;
  limit?: string | number;
  agentId?: string;
}

export interface EmotionalIncidentRow {
  id: string;
  agentId: string;
  issueId?: string | null;
  detectedAt?: string | Date | null;
  classification?: string | null;
  interventionKind?: string | null;
  outcome?: string | null;
  outcomeNotes?: string | null;
  confidence?: number | null;
}

export interface AuditReport {
  windowSinceDays: number;
  total: number;
  byClassification: Record<string, number>;
  byOutcome: Record<string, number>;
  byIntervention: Record<string, number>;
  rows: EmotionalIncidentRow[];
}

export function buildAuditReport(
  rows: ReadonlyArray<EmotionalIncidentRow>,
  windowSinceDays: number,
): AuditReport {
  const byClassification: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const byIntervention: Record<string, number> = {};
  for (const row of rows) {
    const c = row.classification ?? "unknown";
    byClassification[c] = (byClassification[c] ?? 0) + 1;
    const o = row.outcome ?? "pending";
    byOutcome[o] = (byOutcome[o] ?? 0) + 1;
    const k = row.interventionKind ?? "none";
    byIntervention[k] = (byIntervention[k] ?? 0) + 1;
  }
  return {
    windowSinceDays,
    total: rows.length,
    byClassification,
    byOutcome,
    byIntervention,
    rows: [...rows],
  };
}

export function formatAuditReport(
  report: AuditReport,
  opts: { json?: boolean } = {},
): string {
  if (opts.json) return JSON.stringify(report, null, 2);

  const lines: string[] = [];
  lines.push(`Emotional interventions — last ${report.windowSinceDays} days`);
  lines.push(`Total incidents: ${report.total}`);
  lines.push("");
  lines.push("By classification:");
  for (const [k, v] of Object.entries(report.byClassification).sort()) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("");
  lines.push("By outcome:");
  for (const [k, v] of Object.entries(report.byOutcome).sort()) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("");
  lines.push("By intervention kind:");
  for (const [k, v] of Object.entries(report.byIntervention).sort()) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("");
  if (report.rows.length === 0) {
    lines.push("(no incidents in window)");
  } else {
    lines.push("Incidents:");
    for (const row of report.rows) {
      lines.push(formatAuditRow(row));
    }
  }
  return lines.join("\n");
}

function formatAuditRow(row: EmotionalIncidentRow): string {
  const parts: string[] = [];
  parts.push(`id=${row.id.slice(0, 8)}`);
  parts.push(`agent=${row.agentId.slice(0, 8)}`);
  if (row.detectedAt) {
    const d = row.detectedAt instanceof Date ? row.detectedAt : new Date(row.detectedAt);
    if (!isNaN(d.getTime())) parts.push(`at=${d.toISOString()}`);
  }
  if (row.classification) parts.push(`classification=${row.classification}`);
  if (row.interventionKind) parts.push(`intervention=${row.interventionKind}`);
  if (row.outcome) parts.push(`outcome=${row.outcome}`);
  if (row.issueId) parts.push(`issue=${row.issueId}`);
  return "  " + parts.join(" ");
}

export function registerAuditCommand(program: Command): void {
  const audit = program
    .command("audit")
    .description("Read-only audit reports for PetAgent governance.");

  addCommonClientOptions(
    audit
      .command("emotional-interventions")
      .description(
        "List psychologist interventions over a time window, grouped by classification / outcome / intervention kind.",
      )
      .requiredOption("-C, --company-id <id>", "Company ID")
      .option(
        "--since-days <n>",
        "Window in days (default 30, max 365)",
        (v) => Number(v),
      )
      .option("--limit <n>", "Max rows to return (default 100, max 500)", (v) =>
        Number(v),
      )
      .option("--agent-id <id>", "Filter to a single agent")
      .action(async (opts: AuditOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const sinceDays = Number(opts.sinceDays ?? 30);
          const limit = Number(opts.limit ?? 100);
          const qs = new URLSearchParams();
          qs.set("sinceDays", String(sinceDays));
          qs.set("limit", String(limit));
          if (opts.agentId) qs.set("agentId", opts.agentId);
          const rows =
            (await ctx.api.get<EmotionalIncidentRow[]>(
              `/api/companies/${ctx.companyId}/emotional-incidents?${qs.toString()}`,
            )) ?? [];
          const report = buildAuditReport(rows, sinceDays);
          if (ctx.json) {
            printOutput(report, { json: true });
            return;
          }
          console.log(formatAuditReport(report));
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
