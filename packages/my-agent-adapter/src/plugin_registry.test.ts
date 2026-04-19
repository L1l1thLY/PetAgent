import { describe, it, expect, vi } from "vitest";
import { PluginRegistry } from "./plugin_registry.js";
import type { PetAgentPlugin } from "./plugin.js";

function makePlugin(overrides: Partial<PetAgentPlugin> = {}): PetAgentPlugin {
  return {
    role: "coordinator",
    module: "default",
    version: 1,
    metadata: { description: "test", author: "t" },
    execute: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe("PluginRegistry", () => {
  it("registers and retrieves by role/module/version", () => {
    const reg = new PluginRegistry();
    const p = makePlugin();
    reg.register(p);
    expect(reg.get("coordinator", "default", 1)).toBe(p);
  });

  it("separate versions are distinct entries", () => {
    const reg = new PluginRegistry();
    const v1 = makePlugin({ version: 1 });
    const v2 = makePlugin({ version: 2 });
    reg.register(v1);
    reg.register(v2);
    expect(reg.list()).toHaveLength(2);
    expect(reg.get("coordinator", "default", 1)).toBe(v1);
    expect(reg.get("coordinator", "default", 2)).toBe(v2);
  });

  it("unregister removes the entry", () => {
    const reg = new PluginRegistry();
    reg.register(makePlugin());
    reg.unregister("coordinator", "default", 1);
    expect(reg.list()).toHaveLength(0);
  });

  it("getActiveForAgent resolves via route lookup", async () => {
    const reg = new PluginRegistry();
    const p = makePlugin();
    reg.register(p);
    const found = await reg.getActiveForAgent("agent-1", "coordinator", "default", {
      lookupActive: vi.fn().mockResolvedValue({ pluginKey: "coordinator/default/1" }),
    });
    expect(found).toBe(p);
  });

  it("getActiveForAgent returns null when no route", async () => {
    const reg = new PluginRegistry();
    reg.register(makePlugin());
    const found = await reg.getActiveForAgent("agent-1", "coordinator", "default", {
      lookupActive: vi.fn().mockResolvedValue(null),
    });
    expect(found).toBeNull();
  });
});
