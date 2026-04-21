import type { PetAgentPlugin, PluginContext, PluginRole } from "./plugin.js";
import type { PluginRegistry, RouteLookup } from "./plugin_registry.js";
import type { AgentRuntime } from "./runtime/types.js";
import type { RoleTemplate } from "@petagent/role-template";

export interface PreventivePromptSource {
  suffixFor(agentId: string, role: PluginRole): Promise<string | null>;
}

export interface AdapterDeps {
  registry: PluginRegistry;
  routes: RouteLookup;
  runtimeFor(isolation: RoleTemplate["isolation"]): AgentRuntime;
  preventivePrompt?: PreventivePromptSource;
}

export interface AdapterInvokeInput {
  ctx: PluginContext;
  module: string;
  payload: unknown;
}

/**
 * Top-level adapter the Paperclip runtime calls. Resolves the active
 * plugin for (agent, role, module) and dispatches. The plugin may itself
 * call ctx.runtime (via closure in caller) if it needs LLM turns; this
 * class only deals with plugin resolution, not model invocation.
 *
 * If `preventivePrompt` is wired, the role template's prompt is suffixed
 * with the agent's documented failure modes (spec §7.7) before dispatch.
 */
export class PetAgentAdapter {
  constructor(private readonly deps: AdapterDeps) {}

  async invoke(input: AdapterInvokeInput): Promise<unknown> {
    const role = input.ctx.roleTemplate.roleType as PluginRole;
    const plugin: PetAgentPlugin | null = await this.deps.registry.getActiveForAgent(
      input.ctx.agentId,
      role,
      input.module,
      this.deps.routes,
    );
    if (!plugin) {
      throw new Error(
        `no active plugin routed for agent=${input.ctx.agentId} role=${role} module=${input.module}`,
      );
    }
    const ctx = await this.applyPreventivePrompt(input.ctx, role);
    return plugin.execute(input.payload, ctx);
  }

  private async applyPreventivePrompt(
    ctx: PluginContext,
    role: PluginRole,
  ): Promise<PluginContext> {
    if (!this.deps.preventivePrompt) return ctx;
    let suffix: string | null;
    try {
      suffix = await this.deps.preventivePrompt.suffixFor(ctx.agentId, role);
    } catch (err) {
      ctx.logger.warn("preventive prompt source failed; continuing without suffix", {
        error: err instanceof Error ? err.message : String(err),
      });
      return ctx;
    }
    if (!suffix) return ctx;
    return {
      ...ctx,
      roleTemplate: {
        ...ctx.roleTemplate,
        prompt: `${ctx.roleTemplate.prompt}\n${suffix}`,
      },
    };
  }
}
