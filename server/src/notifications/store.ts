/**
 * Notification center (spec §17.6).
 *
 * Ships a minimal port + an in-memory store; the DB-persisted
 * drizzle implementation lands post-M1 once the notifications table
 * migration is cut. The HookBus subscriber that translates budget /
 * severe-intervention events to notifications is also post-M1 glue
 * (the classifier below exposes the pure mapping).
 */

import { randomUUID } from "node:crypto";
import type { HookEvent } from "@petagent/hooks";

export const NOTIFICATION_KINDS = [
  "budget.warning",
  "budget.critical",
  "budget.exceeded",
  "intervention.severe",
  "intervention.escalated",
  "skill.candidate",
  "plugin.upgrade",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notification {
  id: string;
  companyId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  payload?: Record<string, unknown>;
}

export interface NotificationStore {
  list(
    companyId: string,
    opts?: { unreadOnly?: boolean; limit?: number },
  ): Promise<Notification[]>;
  create(input: Omit<Notification, "id" | "createdAt" | "readAt">): Promise<Notification>;
  markRead(id: string, at?: Date): Promise<boolean>;
  markAllRead(companyId: string, at?: Date): Promise<number>;
  delete(id: string): Promise<boolean>;
  unreadCount(companyId: string): Promise<number>;
}

export class InMemoryNotificationStore implements NotificationStore {
  private readonly byId = new Map<string, Notification>();

  async list(
    companyId: string,
    opts: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<Notification[]> {
    const rows: Notification[] = [];
    for (const row of this.byId.values()) {
      if (row.companyId !== companyId) continue;
      if (opts.unreadOnly && row.readAt !== null) continue;
      rows.push(row);
    }
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const limit = opts.limit ?? 100;
    return rows.slice(0, limit);
  }

  async create(input: Omit<Notification, "id" | "createdAt" | "readAt">): Promise<Notification> {
    const row: Notification = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
      readAt: null,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async markRead(id: string, at: Date = new Date()): Promise<boolean> {
    const row = this.byId.get(id);
    if (!row) return false;
    if (row.readAt !== null) return false;
    row.readAt = at;
    return true;
  }

  async markAllRead(companyId: string, at: Date = new Date()): Promise<number> {
    let count = 0;
    for (const row of this.byId.values()) {
      if (row.companyId !== companyId) continue;
      if (row.readAt !== null) continue;
      row.readAt = at;
      count += 1;
    }
    return count;
  }

  async delete(id: string): Promise<boolean> {
    return this.byId.delete(id);
  }

  async unreadCount(companyId: string): Promise<number> {
    let count = 0;
    for (const row of this.byId.values()) {
      if (row.companyId !== companyId) continue;
      if (row.readAt === null) count += 1;
    }
    return count;
  }
}

// ─── Classifier: HookEvent → Notification candidate ─────────────────────────

export interface NotificationCandidate {
  companyId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

/**
 * Map a HookEvent into a notification candidate. Returns null when the
 * event isn't interesting (most aren't). This pure function is the
 * seam the HookBus subscriber uses — the subscriber itself is thin:
 *   if (candidate !== null) await store.create(candidate);
 */
export function classifyHookEvent(event: HookEvent): NotificationCandidate | null {
  if (event.type === "approval.requested") {
    return null; // approvals have their own surface; skip to avoid duplication
  }
  if (event.type === "heartbeat.ended") {
    const status = stringField(event.payload, "status");
    if (status === "failed" && stringField(event.payload, "severity") === "severe") {
      return {
        companyId: event.companyId,
        kind: "intervention.severe",
        title: "Severe intervention",
        body: stringField(event.payload, "message") ?? "A severe emotional intervention was dispatched.",
        payload: event.payload,
      };
    }
  }
  return null;
}

/**
 * Convert a budget-alerts `BudgetAlert` to a notification candidate.
 * Exposed separately because BudgetAlert doesn't come through HookBus —
 * the routine cycle calls this directly.
 */
export interface BudgetAlertLike {
  scopeKind: "company" | "agent";
  scopeId: string;
  label: string;
  level: "warning" | "critical" | "exceeded";
  utilization: number;
  budgetCents: number;
  spentCents: number;
}

export function classifyBudgetAlert(
  companyId: string,
  alert: BudgetAlertLike,
): NotificationCandidate {
  const kind: NotificationKind =
    alert.level === "exceeded"
      ? "budget.exceeded"
      : alert.level === "critical"
        ? "budget.critical"
        : "budget.warning";
  const pct = (alert.utilization * 100).toFixed(1);
  return {
    companyId,
    kind,
    title:
      alert.level === "exceeded"
        ? `${titleCase(alert.scopeKind)} ${alert.label} exceeded budget`
        : alert.level === "critical"
          ? `${titleCase(alert.scopeKind)} ${alert.label} at ${pct}%`
          : `${titleCase(alert.scopeKind)} ${alert.label} at ${pct}%`,
    body: `${pctSpendLine(alert)}`,
    payload: {
      scopeKind: alert.scopeKind,
      scopeId: alert.scopeId,
      utilization: alert.utilization,
      budgetCents: alert.budgetCents,
      spentCents: alert.spentCents,
    },
  };
}

function pctSpendLine(alert: BudgetAlertLike): string {
  return `$${(alert.spentCents / 100).toFixed(2)} / $${(alert.budgetCents / 100).toFixed(2)} (${(alert.utilization * 100).toFixed(1)}%)`;
}

function titleCase(s: string): string {
  return s[0]?.toUpperCase() + s.slice(1);
}

function stringField(obj: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = obj?.[key];
  return typeof v === "string" ? v : null;
}
