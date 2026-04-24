import { describe, it, expect } from "vitest";
import {
  evaluateBudgetThresholds,
  pickNewlyFired,
  formatAlertBody,
  runBudgetAlertCycle,
  RecordingAlertNotifier,
  BUDGET_ALERT_THRESHOLDS,
  type AgentSnapshot,
  type BudgetAlertLevel,
  type CompanySnapshot,
} from "../services/budget-alerts.js";

function company(overrides: Partial<CompanySnapshot> = {}): CompanySnapshot {
  return {
    id: "company-1",
    name: "Acme",
    budgetMonthlyCents: 10_000,
    spentMonthlyCents: 0,
    ...overrides,
  };
}

function agent(overrides: Partial<AgentSnapshot>): AgentSnapshot {
  return {
    id: "agent-1",
    name: "Alpha",
    budgetMonthlyCents: 5_000,
    spentMonthlyCents: 0,
    ...overrides,
  };
}

describe("BUDGET_ALERT_THRESHOLDS", () => {
  it("are ordered highest → lowest so the evaluator picks the most severe first", () => {
    const thresholds = BUDGET_ALERT_THRESHOLDS.map((t) => t.threshold);
    const sorted = [...thresholds].sort((a, b) => b - a);
    expect(thresholds).toEqual(sorted);
  });

  it("defines 70% / 90% / 100% levels exactly once each", () => {
    expect(BUDGET_ALERT_THRESHOLDS).toHaveLength(3);
    const levels = BUDGET_ALERT_THRESHOLDS.map((t) => t.level).sort();
    expect(levels).toEqual(["critical", "exceeded", "warning"]);
  });

  it("only the 90% and 100% levels request email; only 100% requests auto-pause", () => {
    const byLevel = new Map(BUDGET_ALERT_THRESHOLDS.map((t) => [t.level, t]));
    expect(byLevel.get("warning")?.sendEmail).toBe(false);
    expect(byLevel.get("critical")?.sendEmail).toBe(true);
    expect(byLevel.get("exceeded")?.sendEmail).toBe(true);
    expect(byLevel.get("exceeded")?.autoPause).toBe(true);
    expect(byLevel.get("critical")?.autoPause).toBe(false);
  });
});

describe("evaluateBudgetThresholds", () => {
  it("returns nothing when every scope is under 70%", () => {
    const alerts = evaluateBudgetThresholds({
      company: company({ spentMonthlyCents: 5_000 }),
      agents: [agent({ spentMonthlyCents: 2_000 })],
    });
    expect(alerts).toEqual([]);
  });

  it("picks warning for 70-89%, critical for 90-99%, exceeded for 100%+", () => {
    const alerts = evaluateBudgetThresholds({
      company: company({ budgetMonthlyCents: 100, spentMonthlyCents: 70 }),
      agents: [
        agent({ id: "a1", budgetMonthlyCents: 100, spentMonthlyCents: 89 }),
        agent({ id: "a2", budgetMonthlyCents: 100, spentMonthlyCents: 90 }),
        agent({ id: "a3", budgetMonthlyCents: 100, spentMonthlyCents: 100 }),
        agent({ id: "a4", budgetMonthlyCents: 100, spentMonthlyCents: 150 }),
      ],
    });
    const byScope = new Map(alerts.map((a) => [a.scopeId, a.level]));
    expect(byScope.get("company-1")).toBe("warning");
    expect(byScope.get("a1")).toBe("warning");
    expect(byScope.get("a2")).toBe("critical");
    expect(byScope.get("a3")).toBe("exceeded");
    expect(byScope.get("a4")).toBe("exceeded");
  });

  it("skips scopes with budget <= 0", () => {
    const alerts = evaluateBudgetThresholds({
      company: company({ budgetMonthlyCents: 0, spentMonthlyCents: 1_000_000 }),
      agents: [
        agent({ budgetMonthlyCents: 0, spentMonthlyCents: 500 }),
      ],
    });
    expect(alerts).toEqual([]);
  });

  it("returns at most one alert per scope (the highest severity it crosses)", () => {
    const alerts = evaluateBudgetThresholds({
      company: company({ budgetMonthlyCents: 100, spentMonthlyCents: 200 }),
      agents: [],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe("exceeded");
  });

  it("carries spend / budget / utilization through on the alert for consumers", () => {
    const alerts = evaluateBudgetThresholds({
      company: company({ budgetMonthlyCents: 100, spentMonthlyCents: 95 }),
      agents: [],
    });
    const alert = alerts[0];
    expect(alert.budgetCents).toBe(100);
    expect(alert.spentCents).toBe(95);
    expect(alert.utilization).toBeCloseTo(0.95, 5);
    expect(alert.label).toBe("Acme");
    expect(alert.scopeKind).toBe("company");
  });
});

describe("pickNewlyFired", () => {
  const warningAlert = {
    scopeKind: "agent" as const,
    scopeId: "a1",
    label: "A1",
    budgetCents: 100,
    spentCents: 72,
    utilization: 0.72,
    level: "warning" as BudgetAlertLevel,
    sendEmail: false,
    autoPause: false,
  };
  const criticalAlert = { ...warningAlert, spentCents: 92, utilization: 0.92, level: "critical" as BudgetAlertLevel, sendEmail: true };

  it("fires every alert when the ledger is empty", () => {
    const out = pickNewlyFired([warningAlert], new Map());
    expect(out).toEqual([warningAlert]);
  });

  it("suppresses same-level repeats", () => {
    const prev = new Map([["agent:a1", "warning" as BudgetAlertLevel]]);
    expect(pickNewlyFired([warningAlert], prev)).toEqual([]);
  });

  it("re-fires when the level escalates", () => {
    const prev = new Map([["agent:a1", "warning" as BudgetAlertLevel]]);
    expect(pickNewlyFired([criticalAlert], prev)).toEqual([criticalAlert]);
  });

  it("does NOT fire when the level de-escalates (budget was raised)", () => {
    const prev = new Map([["agent:a1", "critical" as BudgetAlertLevel]]);
    expect(pickNewlyFired([warningAlert], prev)).toEqual([]);
  });
});

describe("formatAlertBody", () => {
  it("includes spend, budget, and percentage in dollars", () => {
    const text = formatAlertBody({
      scopeKind: "company",
      scopeId: "c1",
      label: "Acme",
      budgetCents: 10_000,
      spentCents: 9_500,
      utilization: 0.95,
      level: "critical",
      sendEmail: true,
      autoPause: false,
    });
    expect(text).toMatch(/Acme/);
    expect(text).toMatch(/\$95\.00 \/ \$100\.00/);
    expect(text).toMatch(/95\.0%/);
  });

  it("includes an action prompt for exceeded level", () => {
    const text = formatAlertBody({
      scopeKind: "agent",
      scopeId: "a1",
      label: "A1",
      budgetCents: 100,
      spentCents: 150,
      utilization: 1.5,
      level: "exceeded",
      sendEmail: true,
      autoPause: true,
    });
    expect(text).toMatch(/exceeded/);
    expect(text).toMatch(/(raise the budget|rotate the work|pause)/);
  });
});

describe("runBudgetAlertCycle", () => {
  it("fires the notifier once per newly-crossed alert and updates the ledger", async () => {
    const notifier = new RecordingAlertNotifier();
    const { fired, levels } = await runBudgetAlertCycle({
      company: company({ budgetMonthlyCents: 100, spentMonthlyCents: 72 }),
      agents: [agent({ id: "a1", budgetMonthlyCents: 100, spentMonthlyCents: 95 })],
      previousLevels: new Map(),
      notifier,
    });
    expect(fired.map((f) => f.level).sort()).toEqual(["critical", "warning"]);
    expect(notifier.sent).toHaveLength(2);
    expect(levels.get("company:company-1")).toBe("warning");
    expect(levels.get("agent:a1")).toBe("critical");
  });

  it("routes email-worthy alerts to the email notifier (only critical/exceeded)", async () => {
    const notifier = new RecordingAlertNotifier();
    const emailNotifier = new RecordingAlertNotifier();
    await runBudgetAlertCycle({
      company: company({ budgetMonthlyCents: 100, spentMonthlyCents: 75 }), // warning only
      agents: [
        agent({ id: "a-crit", budgetMonthlyCents: 100, spentMonthlyCents: 92 }), // critical → email
        agent({ id: "a-exc", budgetMonthlyCents: 100, spentMonthlyCents: 120 }), // exceeded → email
      ],
      previousLevels: new Map(),
      notifier,
      emailNotifier,
    });
    expect(notifier.sent).toHaveLength(3);
    expect(emailNotifier.sent.map((a) => a.scopeId).sort()).toEqual(["a-crit", "a-exc"]);
  });

  it("subsequent cycle with no level changes fires no new notifications", async () => {
    const notifier = new RecordingAlertNotifier();
    const first = await runBudgetAlertCycle({
      company: company({ budgetMonthlyCents: 100, spentMonthlyCents: 72 }),
      agents: [],
      previousLevels: new Map(),
      notifier,
    });
    expect(first.fired).toHaveLength(1);

    const second = await runBudgetAlertCycle({
      company: company({ budgetMonthlyCents: 100, spentMonthlyCents: 75 }), // still warning
      agents: [],
      previousLevels: first.levels,
      notifier,
    });
    expect(second.fired).toHaveLength(0);
    expect(notifier.sent).toHaveLength(1);
  });

  it("an email notifier that throws does not block the main notifier (error isolation)", async () => {
    const main = new RecordingAlertNotifier();
    const flaky = {
      async notify() {
        throw new Error("SMTP down");
      },
    };
    const { fired } = await runBudgetAlertCycle({
      company: company({ budgetMonthlyCents: 100, spentMonthlyCents: 95 }),
      agents: [],
      previousLevels: new Map(),
      notifier: main,
      emailNotifier: flaky,
    }).catch((err) => {
      throw err;
    });
    expect(fired).toHaveLength(1);
    expect(main.sent).toHaveLength(1);
  });
});
