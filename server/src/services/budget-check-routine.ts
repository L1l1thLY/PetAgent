/**
 * Runs `runBudgetAlertCycle` on a setInterval — one tick per interval
 * per company. Keeps the last-fired ledger in memory (lost on restart;
 * that just means the first post-restart cycle is louder).
 *
 * The routine is the glue that turns Task 68's pure evaluator + notifier
 * ports into a live alert pipeline. SMTP emails still need a concrete
 * email notifier; for V1 we pass a `ConsoleAlertNotifier` plus the
 * notification store bridge so bell + console get the alert even when
 * no SMTP is configured.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agents, companies, costEvents } from "@petagent/db";
import {
  ConsoleAlertNotifier,
  runBudgetAlertCycle,
  type AgentSnapshot,
  type BudgetAlert,
  type BudgetAlertLevel,
  type BudgetAlertNotifier,
  type CompanySnapshot,
} from "./budget-alerts.js";
import type { NotificationStore } from "../notifications/store.js";
import { notifyBudgetAlert } from "../notifications/hook_bridge.js";

export interface BudgetCheckRoutineOptions {
  db: Db;
  notificationStore?: NotificationStore;
  emailNotifier?: BudgetAlertNotifier;
  intervalMs?: number;
  onCycleError?: (err: unknown) => void;
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1_000; // hourly

export interface RunningBudgetCheckRoutine {
  stop(): void;
  runOnce(): Promise<void>;
}

export function startBudgetCheckRoutine(
  opts: BudgetCheckRoutineOptions,
): RunningBudgetCheckRoutine {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const perCompanyLevels = new Map<string, Map<string, BudgetAlertLevel>>();

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const cycle = async () => {
    if (stopped) return;
    try {
      await runOneCycle(
        opts.db,
        perCompanyLevels,
        opts.notificationStore ?? null,
        opts.emailNotifier,
      );
    } catch (err) {
      if (opts.onCycleError) opts.onCycleError(err);
      else console.error("[budget-check] cycle failed:", err);
    }
  };

  timer = setInterval(() => {
    void cycle();
  }, intervalMs);

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    runOnce: cycle,
  };
}

async function runOneCycle(
  db: Db,
  perCompanyLevels: Map<string, Map<string, BudgetAlertLevel>>,
  notificationStore: NotificationStore | null,
  emailNotifier: BudgetAlertNotifier | undefined,
): Promise<void> {
  const companyRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      budgetMonthlyCents: companies.budgetMonthlyCents,
    })
    .from(companies);

  for (const company of companyRows) {
    if (!company) continue;
    const spent = await monthToDateSpend(db, company.id);
    const companySnap: CompanySnapshot = {
      id: company.id,
      name: company.name,
      budgetMonthlyCents: Number(company.budgetMonthlyCents ?? 0),
      spentMonthlyCents: spent,
    };
    const agentRows = await db
      .select({
        id: agents.id,
        name: agents.name,
        budgetMonthlyCents: agents.budgetMonthlyCents,
        spentMonthlyCents: agents.spentMonthlyCents,
      })
      .from(agents)
      .where(eq(agents.companyId, company.id));
    const agentSnaps: AgentSnapshot[] = agentRows.map((row) => ({
      id: row.id,
      name: row.name,
      budgetMonthlyCents: Number(row.budgetMonthlyCents ?? 0),
      spentMonthlyCents: Number(row.spentMonthlyCents ?? 0),
    }));

    const notifier: BudgetAlertNotifier = makeCompositeNotifier(
      new ConsoleAlertNotifier(),
      notificationStore
        ? new NotificationStoreNotifier(notificationStore, company.id)
        : null,
    );

    const previous = perCompanyLevels.get(company.id) ?? new Map();
    const result = await runBudgetAlertCycle({
      company: companySnap,
      agents: agentSnaps,
      previousLevels: previous,
      notifier,
      emailNotifier,
    });
    perCompanyLevels.set(company.id, result.levels);
  }
}

async function monthToDateSpend(db: Db, companyId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await db
    .select({
      spend: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision`,
    })
    .from(costEvents)
    .where(
      and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, monthStart)),
    );
  return Number(rows[0]?.spend ?? 0);
}

function makeCompositeNotifier(
  a: BudgetAlertNotifier,
  b: BudgetAlertNotifier | null,
): BudgetAlertNotifier {
  if (!b) return a;
  return {
    async notify(alert: BudgetAlert) {
      await Promise.all([
        a.notify(alert).catch((err) => {
          console.error("[budget-check:notifier-a]", err);
        }),
        b.notify(alert).catch((err) => {
          console.error("[budget-check:notifier-b]", err);
        }),
      ]);
    },
  };
}

class NotificationStoreNotifier implements BudgetAlertNotifier {
  constructor(
    private readonly store: NotificationStore,
    private readonly companyId: string,
  ) {}
  async notify(alert: BudgetAlert): Promise<void> {
    await notifyBudgetAlert(this.store, this.companyId, {
      scopeKind: alert.scopeKind,
      scopeId: alert.scopeId,
      label: alert.label,
      level: alert.level,
      utilization: alert.utilization,
      budgetCents: alert.budgetCents,
      spentCents: alert.spentCents,
    });
  }
}
