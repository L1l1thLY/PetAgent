import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { globalHookBus } from "@petagent/hooks";
import { publishLiveEvent } from "../services/live-events.js";

describe("live-events → heartbeat.ended HookBus mapping", () => {
  let received: Array<{ type: string; agentId?: string; companyId: string }> = [];
  const subscriberName = "test-heartbeat-ended-subscriber";

  beforeEach(() => {
    received = [];
    globalHookBus.register({
      name: subscriberName,
      filter: (e) => e.type === "heartbeat.ended",
      handle: async (e) => {
        received.push({ type: e.type, agentId: e.agentId, companyId: e.companyId });
      },
    });
  });

  afterEach(() => {
    globalHookBus.unregister(subscriberName);
  });

  it("publishes heartbeat.ended on terminal heartbeat.run.status (succeeded)", async () => {
    publishLiveEvent({
      companyId: "co-1",
      type: "heartbeat.run.status",
      payload: { agentId: "agent-1", issueId: "issue-1", status: "succeeded" },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect(received[0].agentId).toBe("agent-1");
  });

  it("does not publish on non-terminal heartbeat.run.status (running)", async () => {
    publishLiveEvent({
      companyId: "co-1",
      type: "heartbeat.run.status",
      payload: { agentId: "agent-1", status: "running" },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(0);
  });
});
