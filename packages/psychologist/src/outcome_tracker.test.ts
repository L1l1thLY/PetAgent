import { describe, it, expect, vi } from "vitest";
import { HookBus, type HookEvent } from "@petagent/hooks";
import { OutcomeTracker } from "./outcome_tracker.js";
import type { IncidentRecord, IncidentStore } from "./types.js";

interface PendingInc {
  id: string;
  agentId: string;
  createdAt: Date;
}

function makeStore(): { store: IncidentStore; pending: PendingInc[]; updates: { id: string; outcome: IncidentRecord["outcome"]; notes?: string }[] } {
  const pending: PendingInc[] = [];
  const updates: { id: string; outcome: IncidentRecord["outcome"]; notes?: string }[] = [];
  return {
    pending,
    updates,
    store: {
      async insert() {
        return { id: "stub" };
      },
      async updateOutcome(id, outcome, notes) {
        updates.push({ id, outcome, notes });
        const idx = pending.findIndex((p) => p.id === id);
        if (idx >= 0) pending.splice(idx, 1);
      },
      async recentForAgent(agentId, limit) {
        return pending.filter((p) => p.agentId === agentId).slice(0, limit);
      },
      async topSignalsForAgent() {
        return [];
      },
    },
  };
}

const baseEnded: HookEvent = {
  type: "heartbeat.ended",
  companyId: "c1",
  agentId: "a1",
  payload: { status: "succeeded" },
  timestamp: new Date().toISOString(),
};

describe("OutcomeTracker", () => {
  it("subscribes to heartbeat.ended only", async () => {
    const bus = new HookBus();
    const { store } = makeStore();
    const tracker = new OutcomeTracker({ bus, incidents: store });
    await tracker.start();
    const subs = bus.list();
    expect(subs).toHaveLength(1);
    expect(subs[0].name).toBe("psychologist:outcome");
  });

  it("marks recovered when next heartbeat status is succeeded", async () => {
    const bus = new HookBus();
    const { store, pending, updates } = makeStore();
    pending.push({ id: "inc_1", agentId: "a1", createdAt: new Date() });
    const tracker = new OutcomeTracker({ bus, incidents: store });
    await tracker.start();

    await bus.publish(baseEnded);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: "inc_1", outcome: "recovered" });
  });

  it("marks escalated when next heartbeat status is failed", async () => {
    const bus = new HookBus();
    const { store, pending, updates } = makeStore();
    pending.push({ id: "inc_2", agentId: "a1", createdAt: new Date() });
    const tracker = new OutcomeTracker({ bus, incidents: store });
    await tracker.start();

    await bus.publish({ ...baseEnded, payload: { status: "failed" } });
    expect(updates[0]).toMatchObject({ id: "inc_2", outcome: "escalated" });
  });

  it("ignores ended events with neither succeeded nor failed status", async () => {
    const bus = new HookBus();
    const { store, pending, updates } = makeStore();
    pending.push({ id: "inc_3", agentId: "a1", createdAt: new Date() });
    const tracker = new OutcomeTracker({ bus, incidents: store });
    await tracker.start();

    await bus.publish({ ...baseEnded, payload: { status: "cancelled" } });
    expect(updates).toHaveLength(0);
  });

  it("does nothing when there is no pending incident for the agent", async () => {
    const bus = new HookBus();
    const { store, updates } = makeStore();
    const tracker = new OutcomeTracker({ bus, incidents: store });
    await tracker.start();

    await bus.publish(baseEnded);
    expect(updates).toHaveLength(0);
  });

  it("only updates the most recent pending incident, not older ones", async () => {
    const bus = new HookBus();
    const { store, pending, updates } = makeStore();
    pending.push(
      { id: "inc_old", agentId: "a1", createdAt: new Date(2026, 0, 1) },
      { id: "inc_new", agentId: "a1", createdAt: new Date(2026, 3, 21) },
    );
    const tracker = new OutcomeTracker({ bus, incidents: store });
    await tracker.start();

    await bus.publish(baseEnded);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("inc_new");
  });

  it("stop() unregisters the subscriber", async () => {
    const bus = new HookBus();
    const { store, pending, updates } = makeStore();
    pending.push({ id: "inc_x", agentId: "a1", createdAt: new Date() });
    const tracker = new OutcomeTracker({ bus, incidents: store });
    await tracker.start();
    await tracker.stop();
    await bus.publish(baseEnded);
    expect(updates).toHaveLength(0);
  });

  it("handles incident-store errors gracefully (no throw on publish)", async () => {
    const bus = new HookBus();
    const errorStore: IncidentStore = {
      async insert() {
        return { id: "x" };
      },
      async updateOutcome() {
        throw new Error("db down");
      },
      async recentForAgent() {
        return [{ id: "inc_1", agentId: "a1", createdAt: new Date() }];
      },
      async topSignalsForAgent() {
        return [];
      },
    };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tracker = new OutcomeTracker({ bus, incidents: errorStore });
    await tracker.start();
    await expect(bus.publish(baseEnded)).resolves.not.toThrow();
    consoleSpy.mockRestore();
  });
});
