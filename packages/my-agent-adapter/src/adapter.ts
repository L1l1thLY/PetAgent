import type { PetAgentPlugin, PluginContext, PluginRole } from "./plugin.js";
import type { PluginRegistry, RouteLookup } from "./plugin_registry.js";
import type { AgentRuntime } from "./runtime/types.js";
import type { RoleTemplate } from "@petagent/role-template";

export interface AdapterDeps {
  registry: PluginRegistry;
  routes: RouteLookup;
  runtimeFor(isolation: RoleTemplate["isolation"]): AgentRuntime;
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
    return plugin.execute(input.payload, input.ctx);
  }
}
