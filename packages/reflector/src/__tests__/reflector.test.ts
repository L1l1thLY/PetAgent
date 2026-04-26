import { describe, it, expect, beforeEach, vi } from "vitest";
import { HookBus } from "@petagent/hooks";
import { Reflector } from "../reflector.js";
import type { NotesSink } from "../types.js";

let bus: HookBus;
let sink: NotesSink;
let creates: Array<Record<string, unknown>>;

beforeEach(() => {
  bus = new HookBus();
  creates = [];
  sink = {
    create: async (args) => {
      creates.push(args);
      return { id: `note-${creates.length}` };
    },
  };
});

describe("Reflector", () => {
  it("only handles heartbeat.ended events", async () => {
    const r = new Reflector({ bus, notesSink: sink });
    await r.start();
    await bus.publish({ type: "agent.output", companyId: "co-1", agentId: "a", timestamp: "t" });
    expect(creates).toHaveLength(0);
  });

  it("calls notesSink.create with the templated content on heartbeat.ended", async () => {
    const r = new Reflector({ bus, notesSink: sink });
    await r.start();
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "a-1",
      issueId: "i-1",
      payload: { status: "succeeded" },
      timestamp: "t",
    });
    expect(creates).toHaveLength(1);
    expect(creates[0].agentId).toBe("a-1");
    expect(creates[0].companyId).toBe("co-1");
    expect(creates[0].sourceIssueId).toBe("i-1");
    expect(creates[0].scope).toBe("project");
    expect(creates[0].noteType).toBe("heartbeat_reflection");
    expect(String(creates[0].content)).toContain("status: succeeded");
  });

  it("debounces consecutive events for the same agent+issue within cooldown", async () => {
    const r = new Reflector({ bus, notesSink: sink, cooldownMs: 10_000 });
    await r.start();
    const evt = {
      type: "heartbeat.ended" as const,
      companyId: "co-1",
      agentId: "a-1",
      issueId: "i-1",
      payload: { status: "succeeded" },
      timestamp: "t",
    };
    await bus.publish(evt);
    await bus.publish(evt);
    expect(creates).toHaveLength(1);
  });

  it("never throws when sink rejects", async () => {
    const failing: NotesSink = { create: async () => { throw new Error("db down"); } };
    const warns: Array<{ msg: string }> = [];
    const r = new Reflector({
      bus,
      notesSink: failing,
      logger: { warn: (msg) => warns.push({ msg: String(msg) }) },
    });
    await r.start();
    await expect(
      bus.publish({
        type: "heartbeat.ended",
        companyId: "co-1",
        agentId: "a-1",
        timestamp: "t",
      }),
    ).resolves.toBeUndefined();
    expect(warns.length).toBe(1);
  });

  it("ignores events without agentId or companyId", async () => {
    const r = new Reflector({ bus, notesSink: sink });
    await r.start();
    await bus.publish({ type: "heartbeat.ended", companyId: "co-1", timestamp: "t" });
    expect(creates).toHaveLength(0);
  });
});

describe("Reflector with ReflectionContextSource", () => {
  it("calls fetchContext and passes context to builder", async () => {
    const fetchContext = vi.fn(async () => ({
      recentOutputs: ["output 1", "output 2"],
      issueTitle: "Deploy to staging",
      issueDescription: "Wire up the staging deploy script.",
    }));
    const builder = {
      build: vi.fn(async () => ({ content: "ok", noteType: "heartbeat_reflection" })),
    };
    const r = new Reflector({
      bus,
      notesSink: sink,
      builder,
      contextSource: { fetchContext },
    });
    await r.start();
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "a-1",
      issueId: "i-1",
      timestamp: "t",
    });
    expect(fetchContext).toHaveBeenCalledWith({ agentId: "a-1", issueId: "i-1" });
    expect(builder.build).toHaveBeenCalledTimes(1);
    const ctxArg = (builder.build.mock.calls[0] as unknown[])[1];
    expect(ctxArg).toEqual({
      recentOutputs: ["output 1", "output 2"],
      issueTitle: "Deploy to staging",
      issueDescription: "Wire up the staging deploy script.",
    });
  });

  it("falls back gracefully when fetchContext rejects", async () => {
    const fetchContext = vi.fn(async () => { throw new Error("db down"); });
    const builder = {
      build: vi.fn(async () => ({ content: "ok", noteType: "heartbeat_reflection" })),
    };
    const r = new Reflector({
      bus,
      notesSink: sink,
      builder,
      contextSource: { fetchContext },
    });
    await r.start();
    await expect(
      bus.publish({
        type: "heartbeat.ended",
        companyId: "co-1",
        agentId: "a-1",
        timestamp: "t",
      }),
    ).resolves.toBeUndefined();
    expect(builder.build).toHaveBeenCalledTimes(1);
    expect((builder.build.mock.calls[0] as unknown[])[1]).toBeUndefined();
  });

  it("passes undefined context when contextSource is not configured", async () => {
    const builder = {
      build: vi.fn(async () => ({ content: "ok", noteType: "heartbeat_reflection" })),
    };
    const r = new Reflector({ bus, notesSink: sink, builder });
    await r.start();
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "a-1",
      timestamp: "t",
    });
    expect((builder.build.mock.calls[0] as unknown[])[1]).toBeUndefined();
  });
});
