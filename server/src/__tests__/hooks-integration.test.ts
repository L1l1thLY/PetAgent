import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { globalHookBus } from "@petagent/hooks";
import { publishLiveEvent } from "../services/live-events.js";

describe("publishLiveEvent -> HookBus forwarding", () => {
  const subscriberName = "hooks-integration-test";

  beforeEach(() => {
    globalHookBus.unregister(subscriberName);
  });

  afterEach(() => {
    globalHookBus.unregister(subscriberName);
  });

  it("forwards agent.status to HookBus as agent.status_change", async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    globalHookBus.register({ name: subscriberName, handle });

    publishLiveEvent({
      companyId: "c1",
      type: "agent.status",
      payload: { agentId: "a1", status: "running" },
    });

    // Give the non-blocking publish a tick to fire.
    await new Promise((r) => setTimeout(r, 0));

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent.status_change",
        companyId: "c1",
        agentId: "a1",
      }),
    );
  });

  it("forwards heartbeat.run.event to HookBus as agent.output", async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    globalHookBus.register({ name: subscriberName, handle });

    publishLiveEvent({
      companyId: "c2",
      type: "heartbeat.run.event",
      payload: { agentId: "a2", issueId: "i2", data: "x" },
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent.output",
        companyId: "c2",
        agentId: "a2",
        issueId: "i2",
      }),
    );
  });

  it("skips events with no HookEventType mapping", async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    globalHookBus.register({ name: subscriberName, handle });

    publishLiveEvent({
      companyId: "c3",
      type: "activity.logged",
      payload: {},
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(handle).not.toHaveBeenCalled();
  });
});
