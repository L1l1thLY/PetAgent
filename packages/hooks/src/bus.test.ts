import { describe, it, expect, vi } from "vitest";
import { HookBus } from "./bus.js";
import type { HookEvent, HookSubscriber } from "./types.js";

function makeEvent(overrides: Partial<HookEvent> = {}): HookEvent {
  return {
    type: "agent.output",
    companyId: "c1",
    payload: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("HookBus", () => {
  it("dispatches to subscriber matching filter", async () => {
    const bus = new HookBus();
    const handle = vi.fn().mockResolvedValue(undefined);
    const sub: HookSubscriber = {
      name: "test",
      filter: (e) => e.type === "agent.output",
      handle,
    };
    bus.register(sub);
    const evt = makeEvent({ type: "agent.output", agentId: "a1", payload: { msg: "hi" } });
    await bus.publish(evt);
    expect(handle).toHaveBeenCalledWith(evt);
  });

  it("skips subscriber when filter returns false", async () => {
    const bus = new HookBus();
    const handle = vi.fn();
    bus.register({ name: "t", filter: () => false, handle });
    await bus.publish(makeEvent());
    expect(handle).not.toHaveBeenCalled();
  });

  it("dispatches to subscribers without filters", async () => {
    const bus = new HookBus();
    const handle = vi.fn().mockResolvedValue(undefined);
    bus.register({ name: "t", handle });
    await bus.publish(makeEvent());
    expect(handle).toHaveBeenCalled();
  });

  it("continues on subscriber error — one bad subscriber does not block others", async () => {
    const bus = new HookBus();
    const good = vi.fn().mockResolvedValue(undefined);
    const bad = vi.fn().mockRejectedValue(new Error("boom"));
    bus.register({ name: "bad", handle: bad });
    bus.register({ name: "good", handle: good });
    await bus.publish(makeEvent());
    expect(good).toHaveBeenCalled();
    expect(bad).toHaveBeenCalled();
  });

  it("unregister removes subscriber", async () => {
    const bus = new HookBus();
    const handle = vi.fn();
    bus.register({ name: "t", handle });
    bus.unregister("t");
    await bus.publish(makeEvent());
    expect(handle).not.toHaveBeenCalled();
  });
});
