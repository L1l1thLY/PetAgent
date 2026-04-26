/**
 * Env-reading factory for the SMTP-backed BudgetAlertNotifier.
 *
 * Required env: SMTP_HOST, SMTP_FROM, SMTP_TO_ADMIN (comma-separated).
 * Optional env: SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE.
 *
 * Returns null when any required field is missing — caller (createApp)
 * is expected to skip wiring email alerts in that case.
 */

import nodemailer from "nodemailer";
import {
  SmtpAlertNotifier,
  type NodemailerLikeTransport,
} from "../services/smtp-alert-notifier.js";
import type { BudgetAlertNotifier } from "../services/budget-alerts.js";

export function createBudgetAlertEmailNotifier(
  env: Record<string, string | undefined>,
): BudgetAlertNotifier | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  const adminRaw = env.SMTP_TO_ADMIN?.trim();
  if (!host || !from || !adminRaw) return null;

  const port = parseInt(env.SMTP_PORT ?? "", 10);
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD?.trim();
  const secure = env.SMTP_SECURE === "true";
  const adminAddresses = adminRaw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  if (adminAddresses.length === 0) return null;

  const transport = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    auth: user && password ? { user, pass: password } : undefined,
  }) as unknown as NodemailerLikeTransport;

  return new SmtpAlertNotifier({
    transport,
    from,
    adminAddresses,
  });
}
