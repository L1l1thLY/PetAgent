/**
 * Wire the HookBus's HookEvent stream to the NotificationStore via the
 * pure `classifyHookEvent` mapping. Also exposes a direct budget-alert
 * bridge for callers that already have a `BudgetAlert` in hand (the
 * budget-check routine skips HookBus and calls the store directly).
 */

import type { HookBus, HookEvent } from "@petagent/hooks";
import {
  classifyBudgetAlert,
  classifyHookEvent,
  type BudgetAlertLike,
  type NotificationStore,
} from "./store.js";

export interface HookBusBridgeOptions {
  bus: HookBus;
  store: NotificationStore;
  subscriberName?: string;
}

/**
 * Attach a HookBus subscriber that forwards classifier-approved events
 * into the notification store. Returns an unsubscribe function.
 */
export function bridgeHookBusToNotifications(
  opts: HookBusBridgeOptions,
): () => void {
  const name = opts.subscriberName ?? "notifications:hook_bridge";
  opts.bus.register({
    name,
    filter: (e) => classifyHookEvent(e) !== null,
    handle: async (e: HookEvent) => {
      const candidate = classifyHookEvent(e);
      if (candidate === null) return;
      try {
        await opts.store.create(candidate);
      } catch (err) {
        console.error("[notifications:hook_bridge] store.create failed:", err);
      }
    },
  });
  return () => opts.bus.unregister(name);
}

/**
 * One-shot helper: take a BudgetAlert, classify it, create the row.
 * The budget routine calls this directly because BudgetAlert isn't a
 * HookBus event — it's the output of `runBudgetAlertCycle`.
 */
export async function notifyBudgetAlert(
  store: NotificationStore,
  companyId: string,
  alert: BudgetAlertLike,
): Promise<void> {
  const candidate = classifyBudgetAlert(companyId, alert);
  await store.create(candidate);
}
