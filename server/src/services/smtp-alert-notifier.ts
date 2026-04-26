/**
 * SMTP-backed BudgetAlertNotifier (spec §18.1).
 *
 * Sends an email via an injected nodemailer-shaped transport when the
 * alert has sendEmail=true and at least one admin address is configured.
 * Errors from the transport are caught and surfaced through the logger
 * — alerting must not throw upstream into the budget-check routine.
 */

import type { BudgetAlert, BudgetAlertNotifier } from "./budget-alerts.js";

export interface NodemailerLikeTransport {
  sendMail(message: {
    from: string;
    to: string | string[];
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

export interface SmtpAlertNotifierDeps {
  transport: NodemailerLikeTransport;
  from: string;
  adminAddresses: ReadonlyArray<string>;
  logger?: { warn(msg: string, meta?: unknown): void };
}

export class SmtpAlertNotifier implements BudgetAlertNotifier {
  private readonly transport: NodemailerLikeTransport;
  private readonly from: string;
  private readonly adminAddresses: ReadonlyArray<string>;
  private readonly logger: { warn(msg: string, meta?: unknown): void };

  constructor(deps: SmtpAlertNotifierDeps) {
    this.transport = deps.transport;
    this.from = deps.from;
    this.adminAddresses = deps.adminAddresses;
    this.logger = deps.logger ?? { warn: () => {} };
  }

  async notify(alert: BudgetAlert): Promise<void> {
    if (!alert.sendEmail) return;
    if (this.adminAddresses.length === 0) return;
    const subject = formatSubject(alert);
    const text = formatBody(alert);
    try {
      await this.transport.sendMail({
        from: this.from,
        to: [...this.adminAddresses],
        subject,
        text,
      });
    } catch (err) {
      this.logger.warn("smtp-alert-notifier.send failed", {
        scopeKind: alert.scopeKind,
        scopeId: alert.scopeId,
        level: alert.level,
        err: String(err),
      });
    }
  }
}

function formatSubject(alert: BudgetAlert): string {
  const pct = Math.round(alert.utilization * 100);
  return `[PetAgent] ${alert.level.toUpperCase()} budget alert — ${alert.label} (${pct}%)`;
}

function formatBody(alert: BudgetAlert): string {
  const pct = Math.round(alert.utilization * 100);
  const lines = [
    `Scope: ${alert.scopeKind} ${alert.label} (${alert.scopeId})`,
    `Level: ${alert.level}`,
    `Spent: ${(alert.spentCents / 100).toFixed(2)} of ${(alert.budgetCents / 100).toFixed(2)} (${pct}%)`,
    "",
    alert.autoPause
      ? "AutoPause: this scope's issues will be paused while spend is over budget."
      : "AutoPause: not triggered at this level.",
    "",
    "— PetAgent budget-check routine",
  ];
  return lines.join("\n");
}
