import { describe, it, expect, vi } from "vitest";
import { PetAgentAdapter, type PreventivePromptSource } from "./adapter.js";
import { PluginRegistry } from "./plugin_registry.js";
import type { PetAgentPlugin, PluginContext, Logger } from "./plugin.js";
import type { RoleTemplate } from "@petagent/role-template";
import type { AgentRuntime } from "./runtime/types.js";

const baseRole: RoleTemplate = {
  roleType: "coordinator",
  description: "test",
  prompt: "You are coordinator.",
  isolation: "none",
  memory: "project",
};

function silentLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeCtx(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    agentId: "agent_a",
    companyId: "company_1",
    memory: { write: vi.fn(), search: vi.fn().mockResolvedValue([]) },
    hooks: { publish: vi.fn() },
    logger: silentLogger(),
    roleTemplate: baseRole,
    ...overrides,
  };
}

function makePlugin(execute = vi.fn().mockResolvedValue({ ok: true })): PetAgentPlugin {
  return {
    role: "coordinator",
    module: "default",
    version: 1,
    metadata: { description: "p", author: "t" },
    execute,
  };
}

const stubRuntime: AgentRuntime = {
  isolation: "none",
  async invoke() {
    return { output: "" };
  },
};

describe("PetAgentAdapter", () => {
  it("dispatches to the routed plugin and forwards payload + ctx", async () => {
    const registry = new PluginRegistry();
    const plugin = makePlugin();
    registry.register(plugin);

    const adapter = new PetAgentAdapter({
      registry,
      routes: {
        lookupActive: vi.fn().mockResolvedValue({ pluginKey: "coordinator/default/1" }),
      },
      runtimeFor: () => stubRuntime,
    });

    const ctx = makeCtx();
    const out = await adapter.invoke({ ctx, module: "default", payload: { goal: "ship" } });
    expect(out).toEqual({ ok: true });
    expect(plugin.execute).toHaveBeenCalledTimes(1);
    expect(plugin.execute).toHaveBeenCalledWith({ goal: "ship" }, expect.objectContaining({
      agentId: "agent_a",
    }));
  });

  it("throws when route lookup returns no plugin", async () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin());
    const adapter = new PetAgentAdapter({
      registry,
      routes: { lookupActive: vi.fn().mockResolvedValue(null) },
      runtimeFor: () => stubRuntime,
    });
    await expect(
      adapter.invoke({ ctx: makeCtx(), module: "default", payload: {} }),
    ).rejects.toThrow(/no active plugin/);
  });

  it("appends preventive suffix to roleTemplate.prompt before dispatch", async () => {
    const registry = new PluginRegistry();
    let receivedPrompt: string | undefined;
    const plugin = makePlugin(
      vi.fn(async (_payload, ctx: PluginContext) => {
        receivedPrompt = ctx.roleTemplate.prompt;
        return { ok: true };
      }),
    );
    registry.register(plugin);

    const preventive: PreventivePromptSource = {
      suffixFor: vi.fn().mockResolvedValue("\n## Your Documented Failure Modes\n1. Frustration loops..."),
    };

    const adapter = new PetAgentAdapter({
      registry,
      routes: { lookupActive: vi.fn().mockResolvedValue({ pluginKey: "coordinator/default/1" }) },
      runtimeFor: () => stubRuntime,
      preventivePrompt: preventive,
    });

    await adapter.invoke({ ctx: makeCtx(), module: "default", payload: {} });
    expect(receivedPrompt).toContain("You are coordinator.");
    expect(receivedPrompt).toContain("Documented Failure Modes");
    expect(preventive.suffixFor).toHaveBeenCalledWith("agent_a", "coordinator");
  });

  it("does not modify prompt when preventive source returns null", async () => {
    const registry = new PluginRegistry();
    let receivedPrompt: string | undefined;
    const plugin = makePlugin(
      vi.fn(async (_payload, ctx: PluginContext) => {
        receivedPrompt = ctx.roleTemplate.prompt;
        return { ok: true };
      }),
    );
    registry.register(plugin);

    const adapter = new PetAgentAdapter({
      registry,
      routes: { lookupActive: vi.fn().mockResolvedValue({ pluginKey: "coordinator/default/1" }) },
      runtimeFor: () => stubRuntime,
      preventivePrompt: { suffixFor: vi.fn().mockResolvedValue(null) },
    });

    await adapter.invoke({ ctx: makeCtx(), module: "default", payload: {} });
    expect(receivedPrompt).toBe("You are coordinator.");
  });

  it("logs warn and dispatches normally when preventive source throws", async () => {
    const registry = new PluginRegistry();
    let receivedPrompt: string | undefined;
    const plugin = makePlugin(
      vi.fn(async (_payload, ctx: PluginContext) => {
        receivedPrompt = ctx.roleTemplate.prompt;
        return { ok: true };
      }),
    );
    registry.register(plugin);

    const logger = silentLogger();
    const adapter = new PetAgentAdapter({
      registry,
      routes: { lookupActive: vi.fn().mockResolvedValue({ pluginKey: "coordinator/default/1" }) },
      runtimeFor: () => stubRuntime,
      preventivePrompt: { suffixFor: vi.fn().mockRejectedValue(new Error("db down")) },
    });

    await adapter.invoke({
      ctx: makeCtx({ logger }),
      module: "default",
      payload: {},
    });
    expect(receivedPrompt).toBe("You are coordinator.");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("preventive prompt source failed"),
      expect.objectContaining({ error: "db down" }),
    );
  });
});
