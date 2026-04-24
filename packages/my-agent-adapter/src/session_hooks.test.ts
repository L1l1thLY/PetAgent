import { describe, it, expect, vi } from "vitest";
import type { SessionHookSpec } from "@petagent/role-template";
import {
  SessionHookManager,
  RecordingHookRunner,
  isSessionHookEvent,
  type HookCommandRunner,
  type HookRunResult,
} from "./session_hooks.js";

function spec(event: SessionHookSpec["event"], command: string): SessionHookSpec {
  return { event, command };
}

describe("isSessionHookEvent", () => {
  it("accepts only the four documented events", () => {
    expect(isSessionHookEvent("on_start")).toBe(true);
    expect(isSessionHookEvent("after_tool_use")).toBe(true);
    expect(isSessionHookEvent("before_stop")).toBe(true);
    expect(isSessionHookEvent("on_error")).toBe(true);
    expect(isSessionHookEvent("on_wake")).toBe(false);
    expect(isSessionHookEvent("")).toBe(false);
  });
});

describe("SessionHookManager register / unregister", () => {
  it("register stores the session; unregister removes it", () => {
    const runner = new RecordingHookRunner();
    const mgr = new SessionHookManager(runner);

    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "worker/executor",
      hooks: [spec("on_start", "echo hello")],
    });

    expect(mgr.getRegistration("s1")?.hooks).toHaveLength(1);
    mgr.unregister("s1");
    expect(mgr.getRegistration("s1")).toBeUndefined();
  });

  it("unregister is a no-op on unknown sessions", () => {
    const mgr = new SessionHookManager(new RecordingHookRunner());
    expect(() => mgr.unregister("never-started")).not.toThrow();
  });

  it("re-registering the same sessionId replaces the prior hook set", () => {
    const mgr = new SessionHookManager(new RecordingHookRunner());
    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "r",
      hooks: [spec("on_start", "first")],
    });
    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "r",
      hooks: [spec("on_start", "second")],
    });
    expect(mgr.getRegistration("s1")?.hooks[0].command).toBe("second");
  });

  it("throws when sessionId is empty", () => {
    const mgr = new SessionHookManager(new RecordingHookRunner());
    expect(() =>
      mgr.register({
        sessionId: "",
        agentId: "a1",
        role: "r",
      }),
    ).toThrow(/sessionId/);
  });

  it("listActive reflects the current registrations", () => {
    const mgr = new SessionHookManager(new RecordingHookRunner());
    mgr.register({ sessionId: "s1", agentId: "a1", role: "r" });
    mgr.register({ sessionId: "s2", agentId: "a2", role: "r" });
    expect(mgr.listActive().map((r) => r.sessionId).sort()).toEqual(["s1", "s2"]);
    mgr.unregister("s1");
    expect(mgr.listActive().map((r) => r.sessionId)).toEqual(["s2"]);
  });
});

describe("SessionHookManager.fire", () => {
  it("fires only the hooks whose event matches", async () => {
    const runner = new RecordingHookRunner();
    const mgr = new SessionHookManager(runner);
    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "r",
      hooks: [
        spec("on_start", "cmd-start"),
        spec("before_stop", "cmd-stop"),
        spec("after_tool_use", "cmd-tool"),
      ],
    });

    await mgr.fire("s1", "on_start");
    expect(runner.invocations.map((i) => i.spec.command)).toEqual(["cmd-start"]);

    await mgr.fire("s1", "before_stop");
    expect(runner.invocations.map((i) => i.spec.command)).toEqual(["cmd-start", "cmd-stop"]);
  });

  it("preserves declaration order within a single event", async () => {
    const runner = new RecordingHookRunner();
    const mgr = new SessionHookManager(runner);
    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "r",
      hooks: [
        spec("on_start", "first"),
        spec("on_start", "second"),
        spec("on_start", "third"),
      ],
    });
    await mgr.fire("s1", "on_start");
    expect(runner.invocations.map((i) => i.spec.command)).toEqual(["first", "second", "third"]);
  });

  it("fire on an unregistered session returns [] without throwing", async () => {
    const mgr = new SessionHookManager(new RecordingHookRunner());
    expect(await mgr.fire("never-started", "on_start")).toEqual([]);
  });

  it("forwards the agentId/role/event/payload into HookRunContext", async () => {
    const runner = new RecordingHookRunner();
    const mgr = new SessionHookManager(runner);
    mgr.register({
      sessionId: "s1",
      agentId: "agent-xyz",
      role: "coordinator",
      hooks: [spec("after_tool_use", "echo tool")],
    });
    await mgr.fire("s1", "after_tool_use", { toolName: "Grep" });
    expect(runner.invocations[0].ctx).toMatchObject({
      sessionId: "s1",
      agentId: "agent-xyz",
      role: "coordinator",
      event: "after_tool_use",
      payload: { toolName: "Grep" },
    });
  });

  it("error isolation: one hook throwing does NOT skip subsequent hooks", async () => {
    let count = 0;
    const runner: HookCommandRunner = {
      async run(spec) {
        count += 1;
        if (spec.command === "crash") throw new Error("boom");
        return { succeeded: true, exitCode: 0, durationMs: 0 };
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mgr = new SessionHookManager(runner);
    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "r",
      hooks: [
        spec("on_start", "first"),
        spec("on_start", "crash"),
        spec("on_start", "third"),
      ],
    });
    const records = await mgr.fire("s1", "on_start");
    expect(count).toBe(3);
    expect(records).toHaveLength(3);
    expect(records[0].result.succeeded).toBe(true);
    expect(records[1].result.succeeded).toBe(false);
    expect(records[1].result.error?.message).toBe("boom");
    expect(records[2].result.succeeded).toBe(true);
    warn.mockRestore();
  });

  it("non-throwing failure (exitCode != 0) is still marked succeeded:false", async () => {
    const runner: HookCommandRunner = {
      async run(): Promise<HookRunResult> {
        return { succeeded: false, exitCode: 7, durationMs: 5 };
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mgr = new SessionHookManager(runner);
    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "r",
      hooks: [spec("on_error", "lint")],
    });
    const records = await mgr.fire("s1", "on_error");
    expect(records[0].result.succeeded).toBe(false);
    expect(records[0].result.exitCode).toBe(7);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("logFailures=false keeps the console quiet on hook failures", async () => {
    const runner: HookCommandRunner = {
      async run(): Promise<HookRunResult> {
        return { succeeded: false, exitCode: 1, durationMs: 0 };
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mgr = new SessionHookManager(runner, { logFailures: false });
    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "r",
      hooks: [spec("on_error", "lint")],
    });
    await mgr.fire("s1", "on_error");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("unregister stops fire() from seeing any hooks", async () => {
    const runner = new RecordingHookRunner();
    const mgr = new SessionHookManager(runner);
    mgr.register({
      sessionId: "s1",
      agentId: "a1",
      role: "r",
      hooks: [spec("on_start", "x")],
    });
    mgr.unregister("s1");
    const records = await mgr.fire("s1", "on_start");
    expect(records).toEqual([]);
    expect(runner.invocations).toEqual([]);
  });
});
