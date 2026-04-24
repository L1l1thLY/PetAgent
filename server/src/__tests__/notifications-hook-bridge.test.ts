import { describe, it, expect, vi } from "vitest";
import { HookBus, type HookEvent } from "@petagent/hooks";
import {
  InMemoryNotificationStore,
} from "../notifications/store.js";
import {
  bridgeHookBusToNotifications,
  notifyBudgetAlert,
} from "../notifications/hook_bridge.js";

function evt(overrides: Partial<HookEvent>): HookEvent {
  return {
    type: "heartbeat.ended",
    companyId: "c1",
    payload: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("bridgeHookBusToNotifications", () => {
  it("creates a notification when the HookEvent classifies to a candidate", async () => {
    const bus = new HookBus();
    const store = new InMemoryNotificationStore();
    bridgeHookBusToNotifications({ bus, store });

    await bus.publish(
      evt({
        type: "heartbeat.ended",
        payload: {
          status: "failed",
          severity: "severe",
          message: "executor gave up",
        },
      }),
    );

    const rows = await store.list("c1");
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("intervention.severe");
    expect(rows[0].body).toBe("executor gave up");
  });

  it("filters out events that classify to null", async () => {
    const bus = new HookBus();
    const store = new InMemoryNotificationStore();
    bridgeHookBusToNotifications({ bus, store });

    await bus.publish(evt({ type: "agent.output", payload: { text: "hi" } }));
    await bus.publish(evt({ type: "issue.created" }));
    await bus.publish(
      evt({ type: "heartbeat.ended", payload: { status: "failed" } }),
    );

    expect(await store.list("c1")).toEqual([]);
  });

  it("store.create errors are logged and do not throw from publish", async () => {
    const bus = new HookBus();
    const store = new InMemoryNotificationStore();
    vi.spyOn(store, "create").mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    bridgeHookBusToNotifications({ bus, store });
    await expect(
      bus.publish(
        evt({
          type: "heartbeat.ended",
          payload: { status: "failed", severity: "severe" },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[notifications:hook_bridge]"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it("unsubscribe detaches from the bus", async () => {
    const bus = new HookBus();
    const store = new InMemoryNotificationStore();
    const unsub = bridgeHookBusToNotifications({ bus, store });

    await bus.publish(
      evt({
        type: "heartbeat.ended",
        payload: { status: "failed", severity: "severe" },
      }),
    );
    expect(await store.list("c1")).toHaveLength(1);

    unsub();
    await bus.publish(
      evt({
        type: "heartbeat.ended",
        payload: { status: "failed", severity: "severe" },
      }),
    );
    expect(await store.list("c1")).toHaveLength(1);
  });
});

describe("notifyBudgetAlert", () => {
  it("creates a notification row matching the classifier output", async () => {
    const store = new InMemoryNotificationStore();
    await notifyBudgetAlert(store, "c1", {
      scopeKind: "company",
      scopeId: "c1",
      label: "Acme",
      level: "critical",
      utilization: 0.92,
      budgetCents: 10_000,
      spentCents: 9_200,
    });
    const rows = await store.list("c1");
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("budget.critical");
    expect(rows[0].title).toMatch(/92\.0%/);
  });
});
