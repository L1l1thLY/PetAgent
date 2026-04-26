import { describe, it, expect, vi } from "vitest";
import { McpManager, StaticMcpServerRegistry } from "../mcp.js";
import { SessionHookManager, type HookCommandRunner } from "../session_hooks.js";
import { wrapRuntimeWithSessionServices } from "./session_services_wrapper.js";
import type { AgentRuntime, RuntimeInvocation, RuntimeResult } from "./types.js";
import type { PluginContext } from "../plugin.js";

const MCP_REGISTRY = [
  { name: "github" },
  { name: "linear" },
];

function makeBaseRuntime(result: Partial<RuntimeResult> = {}): {
  runtime: AgentRuntime;
  invoke: ReturnType<typeof vi.fn>;
} {
  const invoke = vi.fn(async (_input: RuntimeInvocation, _ctx: PluginContext): Promise<RuntimeResult> => ({
    output: "ok",
    ...result,
  }));
  return {
    runtime: { isolation: "remote", invoke } as AgentRuntime,
    invoke,
  };
}

function makeRecordingHookRunner(): {
  runner: HookCommandRunner;
  calls: Array<{ event: string; sessionId: string; command: string }>;
} {
  const calls: Array<{ event: string; sessionId: string; command: string }> = [];
  const runner: HookCommandRunner = {
    async run(spec, ctx) {
      calls.push({ event: spec.event, sessionId: ctx.sessionId, command: spec.command });
      return { succeeded: true, durationMs: 1 };
    },
  };
  return { runner, calls };
}

const baseCtx = (): PluginContext => ({
  agentId: "agent-1",
  companyId: "co-1",
  issueId: "issue-1",
  roleTemplate: { roleType: "executor" } as PluginContext["roleTemplate"],
  logger: { info: () => {}, warn: () => {}, error: () => {} },
} as unknown as PluginContext);

describe("wrapRuntimeWithSessionServices", () => {
  it("delegates to the inner runtime when no services are configured", async () => {
    const { runtime, invoke } = makeBaseRuntime();
    const wrapped = wrapRuntimeWithSessionServices(runtime, {});
    const out = await wrapped.invoke({ prompt: "hi" }, baseCtx());
    expect(out.output).toBe("ok");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("activates the requested mcp servers and tears them down on success", async () => {
    const { runtime } = makeBaseRuntime();
    const mcpManager = new McpManager(new StaticMcpServerRegistry(MCP_REGISTRY));
    const wrapped = wrapRuntimeWithSessionServices(runtime, { mcpManager });
    await wrapped.invoke({ prompt: "hi", mcpServers: ["github"] }, baseCtx());
    // After invoke, session should be torn down — listActive empty
    expect(mcpManager.listActive()).toHaveLength(0);
  });

  it("tears down mcp session even if inner runtime throws", async () => {
    const { runtime } = makeBaseRuntime();
    runtime.invoke = vi.fn(async () => {
      throw new Error("model timeout");
    });
    const mcpManager = new McpManager(new StaticMcpServerRegistry(MCP_REGISTRY));
    const wrapped = wrapRuntimeWithSessionServices(runtime, { mcpManager });
    await expect(
      wrapped.invoke({ prompt: "hi", mcpServers: ["github"] }, baseCtx()),
    ).rejects.toThrow(/model timeout/);
    expect(mcpManager.listActive()).toHaveLength(0);
  });

  it("fires on_start before invoke and before_stop after success", async () => {
    const { runtime } = makeBaseRuntime();
    const { runner, calls } = makeRecordingHookRunner();
    const sessionHookManager = new SessionHookManager(runner, { logFailures: false });
    const wrapped = wrapRuntimeWithSessionServices(runtime, { sessionHookManager });
    await wrapped.invoke(
      {
        prompt: "hi",
        hooks: [
          { event: "on_start", command: "echo start" },
          { event: "before_stop", command: "echo stop" },
        ],
      },
      baseCtx(),
    );
    expect(calls.map((c) => c.event)).toEqual(["on_start", "before_stop"]);
    expect(calls[0].command).toBe("echo start");
  });

  it("fires on_error instead of before_stop when invoke throws", async () => {
    const { runtime } = makeBaseRuntime();
    runtime.invoke = vi.fn(async () => {
      throw new Error("boom");
    });
    const { runner, calls } = makeRecordingHookRunner();
    const sessionHookManager = new SessionHookManager(runner, { logFailures: false });
    const wrapped = wrapRuntimeWithSessionServices(runtime, { sessionHookManager });
    await expect(
      wrapped.invoke(
        {
          prompt: "hi",
          hooks: [
            { event: "on_start", command: "echo start" },
            { event: "before_stop", command: "echo stop" },
            { event: "on_error", command: "echo err" },
          ],
        },
        baseCtx(),
      ),
    ).rejects.toThrow(/boom/);
    expect(calls.map((c) => c.event)).toEqual(["on_start", "on_error"]);
  });

  it("preserves the wrapped runtime's isolation field", () => {
    const { runtime } = makeBaseRuntime();
    const wrapped = wrapRuntimeWithSessionServices(runtime, {});
    expect(wrapped.isolation).toBe(runtime.isolation);
  });

  it("propagates health() when underlying runtime has it", async () => {
    const { runtime } = makeBaseRuntime();
    (runtime as unknown as { health: () => Promise<unknown> }).health = vi.fn(async () => ({ ok: true, details: "alive" }));
    const wrapped = wrapRuntimeWithSessionServices(runtime, {});
    expect(typeof wrapped.health).toBe("function");
    expect(await wrapped.health!()).toEqual({ ok: true, details: "alive" });
  });
});
