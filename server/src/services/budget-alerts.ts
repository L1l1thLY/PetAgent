/**
 * Budget threshold evaluation + notifier port (spec §18.1).
 *
 * The plan calls for tripping alerts at 70% / 90% / 100% of monthly budget.
 * This module ships:
 *   - A pure `evaluateBudgetThresholds(agents, company)` — produces the
 *     list of threshold crossings that need to fire. Pure so the routine
 *     scheduler can test it without spinning up a DB or SMTP.
 *   - A `BudgetAlertNotifier` port — how the alert surfaces (console /
 *     email / notification-center entry) is an injected concern.
 *   - Two concrete notifiers: `ConsoleAlertNotifier` (default; no native
 *     deps) and `CompositeAlertNotifier` (fan out to N sinks). A
 *     nodemailer-backed concrete sender is out of scope; it lands with
 *     the post-M1 SMTP wiring pass.
 *
 * Auto-pause of 100%-exceeded agents' issues is NOT implemented here — it
 * requires intrusive changes to the issue service that are also
 * out of scope for this task. The plan explicitly notes it as the
 * highest-severity action; shipping it is deferred.
 */

export const BUDGET_ALERT_THRESHOLDS = [
  { threshold: 1.0, level: "exceeded" as const, sendEmail: true, autoPause: true },
  { threshold: 0.9, level: "critical" as const, sendEmail: true, autoPause: false },
  { threshold: 0.7, level: "warning" as const, sendEmail: false, autoPause: false },
];

export type BudgetAlertLevel = "warning" | "critical" | "exceeded";

export interface BudgetScope {
  scopeKind: "company" | "agent";
  scopeId: string;
  label: string;
  budgetCents: number;
  spentCents: number;
}

export interface BudgetAlert {
  scopeKind: BudgetScope["scopeKind"];
  scopeId: string;
  label: string;
  budgetCents: number;
  spentCents: number;
  utilization: number;
  level: BudgetAlertLevel;
  sendEmail: boolean;
  autoPause: boolean;
}

export interface AgentSnapshot {
  id: string;
  name: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
}

export interface CompanySnapshot {
  id: string;
  name: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
}

/**
 * Produce the list of alerts to fire given the current snapshot. For each
 * scope we return AT MOST one alert — the highest-severity threshold it
 * crosses. Scopes with no configured budget (budgetCents <= 0) are
 * skipped entirely.
 *
 * This function does NOT deduplicate against previously-fired alerts; the
 * caller is expected to maintain a "last-fired level" per scope so the
 * same alert doesn't re-notify every cycle.
 */
export function evaluateBudgetThresholds(input: {
  company: CompanySnapshot;
  agents: ReadonlyArray<AgentSnapshot>;
}): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];

  if (input.company.budgetMonthlyCents > 0) {
    const alert = highestThresholdFor({
      scopeKind: "company",
      scopeId: input.company.id,
      label: input.company.name,
      budgetCents: input.company.budgetMonthlyCents,
      spentCents: input.company.spentMonthlyCents,
    });
    if (alert) alerts.push(alert);
  }

  for (const agent of input.agents) {
    if (agent.budgetMonthlyCents <= 0) continue;
    const alert = highestThresholdFor({
      scopeKind: "agent",
      scopeId: agent.id,
      label: agent.name,
      budgetCents: agent.budgetMonthlyCents,
      spentCents: agent.spentMonthlyCents,
    });
    if (alert) alerts.push(alert);
  }

  return alerts;
}

function highestThresholdFor(scope: BudgetScope): BudgetAlert | null {
  const utilization = scope.spentCents / scope.budgetCents;
  for (const t of BUDGET_ALERT_THRESHOLDS) {
    if (utilization >= t.threshold) {
      return {
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        label: scope.label,
        budgetCents: scope.budgetCents,
        spentCents: scope.spentCents,
        utilization,
        level: t.level,
        sendEmail: t.sendEmail,
        autoPause: t.autoPause,
      };
    }
  }
  return null;
}

/**
 * Compute the set of newly-fired alerts — i.e. whose level rose above
 * what the caller's last-fired ledger reports. Used by the routine so
 * that an alert at 72% stays silent on the next run at 73% (same level,
 * already notified) but fires again if the level rises to critical.
 */
export function pickNewlyFired(
  alerts: BudgetAlert[],
  previous: ReadonlyMap<string, BudgetAlertLevel>,
): BudgetAlert[] {
  const LEVEL_RANK: Record<BudgetAlertLevel, number> = {
    warning: 1,
    critical: 2,
    exceeded: 3,
  };
  const out: BudgetAlert[] = [];
  for (const alert of alerts) {
    const key = `${alert.scopeKind}:${alert.scopeId}`;
    const prev = previous.get(key);
    if (prev === undefined || LEVEL_RANK[alert.level] > LEVEL_RANK[prev]) {
      out.push(alert);
    }
  }
  return out;
}

/** Human-readable summary used by email body + console notifier. */
export function formatAlertBody(alert: BudgetAlert): string {
  const pct = (alert.utilization * 100).toFixed(1);
  const spent = (alert.spentCents / 100).toFixed(2);
  const budget = (alert.budgetCents / 100).toFixed(2);
  const scopeLabel = alert.scopeKind === "company" ? "Company" : "Agent";
  const verb =
    alert.level === "warning"
      ? "has crossed 70% of its monthly budget"
      : alert.level === "critical"
        ? "has crossed 90% of its monthly budget"
        : "has exceeded its monthly budget";
  const tail =
    alert.level === "exceeded"
      ? "\n\nPlease raise the budget, rotate the work, or pause the affected issues."
      : "";
  return `${scopeLabel} ${alert.label} ${verb}.\nSpend: $${spent} / $${budget} (${pct}%).${tail}`;
}

export interface BudgetAlertNotifier {
  notify(alert: BudgetAlert): Promise<void>;
}

export class ConsoleAlertNotifier implements BudgetAlertNotifier {
  async notify(alert: BudgetAlert): Promise<void> {
    const tag =
      alert.level === "warning"
        ? "[budget:warning]"
        : alert.level === "critical"
          ? "[budget:critical]"
          : "[budget:EXCEEDED]";
    console.warn(`${tag} ${formatAlertBody(alert)}`);
  }
}

export class RecordingAlertNotifier implements BudgetAlertNotifier {
  readonly sent: BudgetAlert[] = [];
  async notify(alert: BudgetAlert): Promise<void> {
    this.sent.push(alert);
  }
}

export class CompositeAlertNotifier implements BudgetAlertNotifier {
  constructor(private readonly sinks: ReadonlyArray<BudgetAlertNotifier>) {}
  async notify(alert: BudgetAlert): Promise<void> {
    await Promise.all(
      this.sinks.map(async (sink) => {
        try {
          await sink.notify(alert);
        } catch (err) {
          console.error("[budget-alerts] notifier failed:", err);
        }
      }),
    );
  }
}

/**
 * One routine cycle: evaluate thresholds, diff against previous levels,
 * fire notifiers for newly-crossed alerts, return the updated ledger.
 *
 * The ledger is an in-memory Map<scopeKey, level>. Callers that want
 * persistence across restarts should serialize + restore it themselves.
 */
export async function runBudgetAlertCycle(input: {
  company: CompanySnapshot;
  agents: ReadonlyArray<AgentSnapshot>;
  previousLevels: Map<string, BudgetAlertLevel>;
  notifier: BudgetAlertNotifier;
  emailNotifier?: BudgetAlertNotifier;
}): Promise<{ fired: BudgetAlert[]; levels: Map<string, BudgetAlertLevel> }> {
  const alerts = evaluateBudgetThresholds({
    company: input.company,
    agents: input.agents,
  });
  const fired = pickNewlyFired(alerts, input.previousLevels);

  for (const alert of fired) {
    try {
      await input.notifier.notify(alert);
    } catch (err) {
      console.error("[budget-alerts] primary notifier failed:", err);
    }
    if (alert.sendEmail && input.emailNotifier) {
      try {
        await input.emailNotifier.notify(alert);
      } catch (err) {
        console.error("[budget-alerts] email notifier failed:", err);
      }
    }
  }

  const levels = new Map(input.previousLevels);
  for (const alert of alerts) {
    levels.set(`${alert.scopeKind}:${alert.scopeId}`, alert.level);
  }
  return { fired, levels };
}
