import type { PetAgentPlugin, PluginRole } from "./plugin.js";

export interface RouteLookup {
  lookupActive(
    agentId: string,
    role: PluginRole,
    module: string,
  ): Promise<{ pluginKey: string } | null>;
}

export class PluginRegistry {
  private readonly plugins = new Map<string, PetAgentPlugin>();

  register(p: PetAgentPlugin): void {
    this.plugins.set(this.key(p.role, p.module, p.version), p);
  }

  unregister(role: PluginRole, module: string, version: number): void {
    this.plugins.delete(this.key(role, module, version));
  }

  get(role: PluginRole, module: string, version: number): PetAgentPlugin | undefined {
    return this.plugins.get(this.key(role, module, version));
  }

  list(): ReadonlyArray<PetAgentPlugin> {
    return Array.from(this.plugins.values());
  }

  /**
   * Resolve the plugin marked active for (agent, role, module) in the route
   * table. A `null` return means no plugin is routed; callers should either
   * fall back to a default skeleton or surface a configuration error.
   */
  async getActiveForAgent(
    agentId: string,
    role: PluginRole,
    module: string,
    routes: RouteLookup,
  ): Promise<PetAgentPlugin | null> {
    const entry = await routes.lookupActive(agentId, role, module);
    if (!entry) return null;
    return this.plugins.get(entry.pluginKey) ?? null;
  }

  private key(role: PluginRole, module: string, version: number): string {
    return `${role}/${module}/${version}`;
  }
}

export const globalPluginRegistry = new PluginRegistry();
