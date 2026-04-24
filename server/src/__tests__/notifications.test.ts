import { describe, it, expect } from "vitest";
import type { HookEvent } from "@petagent/hooks";
import {
  InMemoryNotificationStore,
  classifyHookEvent,
  classifyBudgetAlert,
  NOTIFICATION_KINDS,
  type BudgetAlertLike,
} from "../notifications/store.js";

describe("NOTIFICATION_KINDS", () => {
  it("contains the plan's V1 surface + predeclared M2/M3 entries", () => {
    expect([...NOTIFICATION_KINDS].sort()).toEqual(
      [
        "budget.critical",
        "budget.exceeded",
        "budget.warning",
        "intervention.escalated",
        "intervention.severe",
        "plugin.upgrade",
        "skill.candidate",
      ].sort(),
    );
  });
});

describe("InMemoryNotificationStore", () => {
  it("create returns the full row with id + createdAt + readAt=null", async () => {
    const store = new InMemoryNotificationStore();
    const row = await store.create({
      companyId: "c1",
      kind: "budget.warning",
      title: "test",
      body: "body",
    });
    expect(row.id).toMatch(/[0-9a-f-]+/);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.readAt).toBeNull();
  });

  it("list filters by companyId and returns newest-first", async () => {
    const store = new InMemoryNotificationStore();
    const a = await store.create({ companyId: "c1", kind: "budget.warning", title: "a", body: "" });
    await new Promise((r) => setTimeout(r, 2));
    const b = await store.create({ companyId: "c1", kind: "budget.warning", title: "b", body: "" });
    await store.create({ companyId: "c2", kind: "budget.warning", title: "other", body: "" });
    const rows = await store.list("c1");
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("list supports unreadOnly + limit", async () => {
    const store = new InMemoryNotificationStore();
    const a = await store.create({ companyId: "c1", kind: "budget.warning", title: "a", body: "" });
    await store.create({ companyId: "c1", kind: "budget.critical", title: "b", body: "" });
    await store.markRead(a.id);
    expect((await store.list("c1", { unreadOnly: true })).map((r) => r.title)).toEqual(["b"]);
    expect(await store.list("c1", { limit: 1 })).toHaveLength(1);
  });

  it("markRead is idempotent: returns true once then false", async () => {
    const store = new InMemoryNotificationStore();
    const row = await store.create({ companyId: "c1", kind: "budget.warning", title: "t", body: "" });
    expect(await store.markRead(row.id)).toBe(true);
    expect(await store.markRead(row.id)).toBe(false);
  });

  it("markRead returns false on unknown id", async () => {
    expect(await new InMemoryNotificationStore().markRead("nope")).toBe(false);
  });

  it("markAllRead returns the count flipped", async () => {
    const store = new InMemoryNotificationStore();
    await store.create({ companyId: "c1", kind: "budget.warning", title: "a", body: "" });
    await store.create({ companyId: "c1", kind: "budget.warning", title: "b", body: "" });
    await store.create({ companyId: "c2", kind: "budget.warning", title: "c", body: "" });
    expect(await store.markAllRead("c1")).toBe(2);
    expect(await store.markAllRead("c1")).toBe(0);
  });

  it("unreadCount ignores read rows and other companies", async () => {
    const store = new InMemoryNotificationStore();
    await store.create({ companyId: "c1", kind: "budget.warning", title: "a", body: "" });
    const b = await store.create({ companyId: "c1", kind: "budget.warning", title: "b", body: "" });
    await store.create({ companyId: "c2", kind: "budget.warning", title: "c", body: "" });
    await store.markRead(b.id);
    expect(await store.unreadCount("c1")).toBe(1);
  });

  it("delete removes the row", async () => {
    const store = new InMemoryNotificationStore();
    const row = await store.create({ companyId: "c1", kind: "budget.warning", title: "t", body: "" });
    expect(await store.delete(row.id)).toBe(true);
    expect(await store.list("c1")).toEqual([]);
    expect(await store.delete(row.id)).toBe(false);
  });
});

describe("classifyHookEvent", () => {
  function evt(overrides: Partial<HookEvent>): HookEvent {
    return {
      type: "heartbeat.ended",
      companyId: "c1",
      payload: {},
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it("returns null for events we don't lift to notifications", () => {
    expect(classifyHookEvent(evt({ type: "agent.output" }))).toBeNull();
    expect(classifyHookEvent(evt({ type: "issue.created" }))).toBeNull();
    expect(classifyHookEvent(evt({ type: "approval.requested" }))).toBeNull();
  });

  it("heartbeat.ended with status=failed + severity=severe → intervention.severe", () => {
    const out = classifyHookEvent(
      evt({
        type: "heartbeat.ended",
        payload: { status: "failed", severity: "severe", message: "giving up" },
      }),
    );
    expect(out?.kind).toBe("intervention.severe");
    expect(out?.body).toBe("giving up");
    expect(out?.companyId).toBe("c1");
  });

  it("heartbeat.ended without severity field returns null", () => {
    const out = classifyHookEvent(evt({ type: "heartbeat.ended", payload: { status: "failed" } }));
    expect(out).toBeNull();
  });
});

describe("classifyBudgetAlert", () => {
  function alert(overrides: Partial<BudgetAlertLike>): BudgetAlertLike {
    return {
      scopeKind: "company",
      scopeId: "c1",
      label: "Acme",
      level: "critical",
      utilization: 0.92,
      budgetCents: 10_000,
      spentCents: 9_200,
      ...overrides,
    };
  }

  it("maps each level to the matching notification kind", () => {
    expect(classifyBudgetAlert("c1", alert({ level: "warning" })).kind).toBe("budget.warning");
    expect(classifyBudgetAlert("c1", alert({ level: "critical" })).kind).toBe("budget.critical");
    expect(classifyBudgetAlert("c1", alert({ level: "exceeded", utilization: 1.1 })).kind).toBe("budget.exceeded");
  });

  it("title mentions the scope kind capitalized and includes the percentage for warning/critical", () => {
    const c = classifyBudgetAlert("c1", alert({ level: "critical", utilization: 0.95 }));
    expect(c.title).toMatch(/Company Acme at 95\.0%/);
  });

  it("title for exceeded level says 'exceeded budget' rather than a percentage", () => {
    const c = classifyBudgetAlert("c1", alert({ level: "exceeded", utilization: 1.2 }));
    expect(c.title).toMatch(/exceeded budget/);
  });

  it("body is the dollar-formatted spend line", () => {
    const c = classifyBudgetAlert("c1", alert({ level: "warning", utilization: 0.71, spentCents: 7_100, budgetCents: 10_000 }));
    expect(c.body).toMatch(/\$71\.00 \/ \$100\.00 \(71\.0%\)/);
  });

  it("preserves scope + spend metadata on payload for callers", () => {
    const c = classifyBudgetAlert("c1", alert({ scopeKind: "agent", scopeId: "a1" }));
    expect(c.payload).toMatchObject({ scopeKind: "agent", scopeId: "a1" });
  });
});
