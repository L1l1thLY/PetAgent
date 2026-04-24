/**
 * Bridge from RoleTemplateWatcher emissions to a HookBus. The watcher
 * itself lives in @petagent/role-template; the HookBus lives in
 * @petagent/hooks. This file wires them together without forcing either
 * package to depend on the other — callers pass in a publish function
 * shaped like HookBus's.
 */
import type { RoleTemplateWatcher, WatcherEmission } from "./watcher.js";

export interface RoleTemplateHookEvent {
  type: "role.template_changed";
  companyId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface HookPublishFn {
  (event: RoleTemplateHookEvent): Promise<void> | void;
}

export interface RoleTemplateHookBridgeOptions {
  watcher: RoleTemplateWatcher;
  publish: HookPublishFn;
  /**
   * Role-template changes are not scoped to a single company — they are a
   * host-wide config change. Most HookBus events carry a `companyId`, so
   * callers must supply one (typically the value `"*"` or the sentinel
   * used for platform-wide events).
   */
  companyId: string;
}

/**
 * Subscribe a HookBus publisher to a RoleTemplateWatcher's reloaded
 * emissions. Returns an unsubscribe function that detaches from the
 * watcher — the watcher itself is not stopped (the caller owns its
 * lifecycle).
 */
export function bridgeRoleTemplateWatcherToHookBus(
  opts: RoleTemplateHookBridgeOptions,
): () => void {
  const unsub = opts.watcher.onReloaded(async (emission: WatcherEmission) => {
    try {
      await opts.publish({
        type: "role.template_changed",
        companyId: opts.companyId,
        payload: {
          changes: emission.changes,
        },
        timestamp: emission.reloadedAt.toISOString(),
      });
    } catch (err) {
      console.error("[role-template:hook_bridge] publish failed:", err);
    }
  });
  return unsub;
}
