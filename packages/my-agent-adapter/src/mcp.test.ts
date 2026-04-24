import { describe, it, expect } from "vitest";
import {
  McpManager,
  McpSubsetError,
  StaticMcpServerRegistry,
  type McpServerEntry,
} from "./mcp.js";

const ALL: McpServerEntry[] = [
  { name: "github", label: "GitHub" },
  { name: "linear" },
  { name: "slack" },
  { name: "notion" },
];

function mgr(strict = true): McpManager {
  return new McpManager(new StaticMcpServerRegistry(ALL), { strict });
}

describe("McpManager.startSession", () => {
  it("activates only the servers the role declared", async () => {
    const m = mgr();
    const binding = await m.startSession({
      sessionId: "s1",
      agentId: "a1",
      role: "worker/executor",
      declaredServers: ["github", "linear"],
    });
    expect(binding.active.map((s) => s.name).sort()).toEqual(["github", "linear"]);
    expect(m.isServerActive("s1", "github")).toBe(true);
    expect(m.isServerActive("s1", "linear")).toBe(true);
    expect(m.isServerActive("s1", "slack")).toBe(false);
    expect(m.isServerActive("s1", "notion")).toBe(false);
  });

  it("returns an empty active set when the role declares nothing", async () => {
    const m = mgr();
    const binding = await m.startSession({
      sessionId: "s1",
      agentId: "a1",
      role: "worker/executor",
    });
    expect(binding.active).toEqual([]);
  });

  it("deduplicates the declared list before intersecting", async () => {
    const m = mgr();
    const binding = await m.startSession({
      sessionId: "s1",
      agentId: "a1",
      role: "worker/executor",
      declaredServers: ["github", "github", "linear"],
    });
    expect(binding.active.map((s) => s.name)).toEqual(["github", "linear"]);
  });

  it("strict mode throws McpSubsetError listing missing servers", async () => {
    const m = mgr(true);
    await expect(
      m.startSession({
        sessionId: "s1",
        agentId: "a1",
        role: "worker/executor",
        declaredServers: ["github", "does-not-exist", "other-missing"],
      }),
    ).rejects.toBeInstanceOf(McpSubsetError);

    try {
      await m.startSession({
        sessionId: "s2",
        agentId: "a2",
        role: "worker/executor",
        declaredServers: ["missing-x"],
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(McpSubsetError);
      expect((err as McpSubsetError).missing).toEqual(["missing-x"]);
    }
  });

  it("permissive mode skips missing servers and activates what is available", async () => {
    const m = mgr(false);
    const binding = await m.startSession({
      sessionId: "s1",
      agentId: "a1",
      role: "worker/executor",
      declaredServers: ["github", "does-not-exist"],
    });
    expect(binding.active.map((s) => s.name)).toEqual(["github"]);
  });

  it("refuses to double-start the same sessionId", async () => {
    const m = mgr();
    await m.startSession({
      sessionId: "s1",
      agentId: "a1",
      role: "worker/executor",
      declaredServers: ["github"],
    });
    await expect(
      m.startSession({
        sessionId: "s1",
        agentId: "a2",
        role: "coordinator",
      }),
    ).rejects.toThrow(/already active/);
  });
});

describe("McpManager.stopSession and listActive", () => {
  it("stopSession removes the binding and leaves isServerActive=false", async () => {
    const m = mgr();
    await m.startSession({
      sessionId: "s1",
      agentId: "a1",
      role: "worker/executor",
      declaredServers: ["github"],
    });
    await m.stopSession("s1");
    expect(m.getBinding("s1")).toBeUndefined();
    expect(m.isServerActive("s1", "github")).toBe(false);
  });

  it("stopSession is a no-op on unknown sessions", async () => {
    const m = mgr();
    await expect(m.stopSession("never-started")).resolves.toBeUndefined();
  });

  it("listActive reflects the currently open sessions", async () => {
    const m = mgr();
    await m.startSession({
      sessionId: "s1",
      agentId: "a1",
      role: "worker/executor",
      declaredServers: ["github"],
    });
    await m.startSession({
      sessionId: "s2",
      agentId: "a2",
      role: "coordinator",
      declaredServers: ["linear"],
    });
    expect(m.listActive().map((b) => b.sessionId).sort()).toEqual(["s1", "s2"]);
    await m.stopSession("s1");
    expect(m.listActive().map((b) => b.sessionId)).toEqual(["s2"]);
  });
});

describe("StaticMcpServerRegistry", () => {
  it("freezes its entry list to prevent external mutation", async () => {
    const entries: McpServerEntry[] = [{ name: "github" }];
    const registry = new StaticMcpServerRegistry(entries);
    const available = await registry.availableServers();
    expect(Object.isFrozen(available)).toBe(true);
    entries.push({ name: "linear" });
    const available2 = await registry.availableServers();
    // mutations to the source array must not leak into the registry
    expect(available2.length).toBe(1);
  });
});
