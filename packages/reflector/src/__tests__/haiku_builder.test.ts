import { describe, it, expect, vi } from "vitest";
import { HaikuReflectionBuilder } from "../haiku_builder.js";
import type { ReflectionTransport } from "../haiku_builder.js";
import type { HookEvent } from "@petagent/hooks";

const baseEvent: HookEvent = {
  type: "heartbeat.ended",
  companyId: "co-1",
  agentId: "agent-1",
  issueId: "issue-1",
  payload: { status: "succeeded", durationMs: 1234 },
  timestamp: "2026-04-26T10:00:00Z",
};

describe("HaikuReflectionBuilder", () => {
  it("calls the transport with system + structured user prompt", async () => {
    const send = vi.fn<ReflectionTransport["send"]>(async () => "Wrapped up an authentication subtask cleanly.");
    const builder = new HaikuReflectionBuilder({
      transport: { send },
    });
    const out = await builder.build(baseEvent);
    expect(out.noteType).toBe("heartbeat_reflection");
    expect(out.content).toContain("Wrapped up an authentication subtask cleanly.");
    expect(send).toHaveBeenCalledTimes(1);
    const call = send.mock.calls[0]![0];
    expect(call.system).toMatch(/reflect/i);
    expect(call.userMessage).toContain("status: succeeded");
    expect(call.userMessage).toContain("duration: 1234ms");
    expect(call.userMessage).toContain("issue: issue-1");
    expect(call.model).toBe("claude-haiku-4-5-20251001");
  });

  it("returns a templated fallback when transport throws", async () => {
    const send = vi.fn<ReflectionTransport["send"]>(async () => { throw new Error("upstream"); });
    const builder = new HaikuReflectionBuilder({
      transport: { send },
    });
    const out = await builder.build(baseEvent);
    expect(out.noteType).toBe("heartbeat_reflection");
    expect(out.content).toContain("status: succeeded");
    expect(out.content).toContain("Auto-templated reflection (LLM call failed");
  });

  it("respects an injected model option", async () => {
    const send = vi.fn<ReflectionTransport["send"]>(async () => "ok");
    const builder = new HaikuReflectionBuilder({
      transport: { send },
      model: "claude-opus-4-7",
    });
    await builder.build(baseEvent);
    expect(send.mock.calls[0]![0].model).toBe("claude-opus-4-7");
  });

  it("trims excessive trailing whitespace from the LLM response", async () => {
    const send = vi.fn<ReflectionTransport["send"]>(async () => "  reflective note  \n\n");
    const builder = new HaikuReflectionBuilder({
      transport: { send },
    });
    const out = await builder.build(baseEvent);
    expect(out.content.trim().endsWith("reflective note")).toBe(true);
  });

  it("falls back to templated when LLM returns empty text", async () => {
    const send = vi.fn<ReflectionTransport["send"]>(async () => "");
    const builder = new HaikuReflectionBuilder({
      transport: { send },
    });
    const out = await builder.build(baseEvent);
    expect(out.content).toContain("Auto-templated reflection (LLM returned empty)");
  });
});
