/**
 * Higher-order wrapper that decorates an `AgentRuntime` with per-session
 * MCP + hook bookkeeping (spec §3.8 §3.9). All three concrete runtimes
 * (managed_agents / local_process / worktree) keep their existing single-
 * responsibility shape; the session-service lifecycle is centralized
 * here so we don't repeat the start/stop/error dance in each one.
 *
 * The session id is derived from the PluginContext (agentId + issueId +
 * a monotonic counter) so concurrent invocations on the same agent get
 * distinct sessions. McpManager / SessionHookManager are optional — if
 * neither is provided, this becomes a transparent passthrough.
 */

import type { AgentRuntime, RuntimeInvocation, RuntimeResult } from "./types.js";
import type { PluginContext } from "../plugin.js";
import type { McpManager } from "../mcp.js";
import type { SessionHookManager } from "../session_hooks.js";

export interface SessionServices {
  mcpManager?: McpManager;
  sessionHookManager?: SessionHookManager;
}

let sessionCounter = 0;
function nextSessionId(ctx: PluginContext): string {
  sessionCounter += 1;
  const issueRef = ctx.issueId ?? "no-issue";
  return `sess-${ctx.agentId}-${issueRef}-${sessionCounter}-${Date.now()}`;
}

export function wrapRuntimeWithSessionServices(
  inner: AgentRuntime,
  services: SessionServices,
): AgentRuntime {
  const wrapped: AgentRuntime = {
    isolation: inner.isolation,
    async invoke(input: RuntimeInvocation, ctx: PluginContext): Promise<RuntimeResult> {
      const sessionId = nextSessionId(ctx);
      let mcpStarted = false;
      let hooksRegistered = false;

      try {
        if (services.mcpManager) {
          await services.mcpManager.startSession({
            sessionId,
            agentId: ctx.agentId,
            role: ctx.roleTemplate.roleType,
            declaredServers: input.mcpServers,
          });
          mcpStarted = true;
        }
        if (services.sessionHookManager) {
          services.sessionHookManager.register({
            sessionId,
            agentId: ctx.agentId,
            role: ctx.roleTemplate.roleType,
            hooks: input.hooks,
          });
          hooksRegistered = true;
          await services.sessionHookManager.fire(sessionId, "on_start", {
            issueId: ctx.issueId,
          });
        }

        let result: RuntimeResult;
        try {
          result = await inner.invoke(input, ctx);
        } catch (err) {
          if (services.sessionHookManager && hooksRegistered) {
            await services.sessionHookManager.fire(sessionId, "on_error", {
              issueId: ctx.issueId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          throw err;
        }

        if (services.sessionHookManager && hooksRegistered) {
          await services.sessionHookManager.fire(sessionId, "before_stop", {
            issueId: ctx.issueId,
          });
        }
        return result;
      } finally {
        if (mcpStarted && services.mcpManager) {
          await services.mcpManager.stopSession(sessionId).catch(() => {
            // teardown errors should not mask the original outcome
          });
        }
        if (hooksRegistered && services.sessionHookManager) {
          services.sessionHookManager.unregister(sessionId);
        }
      }
    },
  };

  if (typeof inner.health === "function") {
    wrapped.health = inner.health.bind(inner);
  }
  return wrapped;
}
