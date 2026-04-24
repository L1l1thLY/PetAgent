import { describe, it, expect } from "vitest";
import type { Agent } from "@petagent/shared";
import {
  summarizeStatus,
  formatStatus,
  startOfDay,
  type IssueLike,
  type IncidentLike,
  type DashboardLike,
} from "../commands/status.js";

function ag(overrides: Partial<Agent>): Pick<Agent, "id" | "name" | "status" | "budgetMonthlyCents" | "spentMonthlyCents"> {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Alpha",
    status: "idle",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    ...overrides,
  } as Pick<Agent, "id" | "name" | "status" | "budgetMonthlyCents" | "spentMonthlyCents">;
}

const REFERENCE_NOW = new Date("2026-04-22T10:30:00-04:00");
const TODAY_START = startOfDay(REFERENCE_NOW);
const YESTERDAY = new Date(TODAY_START.getTime() - 5 * 60 * 60 * 1000);
const LATER_TODAY = new Date(TODAY_START.getTime() + 2 * 60 * 60 * 1000);

describe("startOfDay", () => {
  it("zeros h/m/s/ms and keeps the local date", () => {
    const soD = startOfDay(REFERENCE_NOW);
    expect(soD.getHours()).toBe(0);
    expect(soD.getMinutes()).toBe(0);
    expect(soD.getSeconds()).toBe(0);
    expect(soD.getMilliseconds()).toBe(0);
    expect(soD.getDate()).toBe(REFERENCE_NOW.getDate());
  });
});

describe("summarizeStatus — issues completed today", () => {
  it("counts only issues with status=done whose updatedAt falls inside today's window", () => {
    const issues: IssueLike[] = [
      { status: "done", updatedAt: LATER_TODAY, identifier: "ISS-1", title: "shipped today" },
      { status: "done", updatedAt: YESTERDAY, title: "shipped yesterday (excluded)" },
      { status: "in_progress", updatedAt: LATER_TODAY, title: "in progress today (excluded)" },
      { status: "done", updatedAt: null, title: "no timestamp (excluded)" },
    ];
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [],
      issues,
      incidents: [],
    });
    expect(s.issuesCompletedToday).toBe(1);
    expect(s.issuesHighlightedToday).toEqual([{ identifier: "ISS-1", title: "shipped today" }]);
  });

  it("highlights list is capped at 5 entries", () => {
    const issues: IssueLike[] = Array.from({ length: 12 }).map((_, i) => ({
      status: "done",
      updatedAt: LATER_TODAY,
      identifier: `ISS-${i + 1}`,
      title: `issue ${i + 1}`,
    }));
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [],
      issues,
      incidents: [],
    });
    expect(s.issuesCompletedToday).toBe(12);
    expect(s.issuesHighlightedToday).toHaveLength(5);
  });
});

describe("summarizeStatus — interventions today", () => {
  it("buckets interventions by classification, ignoring entries outside the window", () => {
    const incidents: IncidentLike[] = [
      { classification: "moderate", detectedAt: LATER_TODAY },
      { classification: "severe", detectedAt: LATER_TODAY },
      { classification: "moderate", detectedAt: LATER_TODAY },
      { classification: "mild", detectedAt: YESTERDAY }, // excluded
    ];
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [],
      issues: [],
      incidents,
    });
    expect(s.interventionsToday).toBe(3);
    expect(s.interventionsBySeverity).toEqual({ moderate: 2, severe: 1 });
  });

  it("falls back to severity when classification is absent", () => {
    const incidents: IncidentLike[] = [
      { severity: "mild", detectedAt: LATER_TODAY },
    ];
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [],
      issues: [],
      incidents,
    });
    expect(s.interventionsBySeverity.mild).toBe(1);
  });

  it("uses 'unknown' bucket when both classification and severity are missing", () => {
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [],
      issues: [],
      incidents: [{ detectedAt: LATER_TODAY }],
    });
    expect(s.interventionsBySeverity.unknown).toBe(1);
  });
});

describe("summarizeStatus — agents and budget", () => {
  it("buckets agents by status", () => {
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [ag({ status: "idle" }), ag({ status: "idle" }), ag({ status: "running" })],
      issues: [],
      incidents: [],
    });
    expect(s.agentsByStatus).toEqual({ idle: 2, running: 1 });
    expect(s.agentCount).toBe(3);
  });

  it("flags agents ≥90% of their monthly budget", () => {
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [
        ag({ id: "a-ok", name: "OK", budgetMonthlyCents: 10_000, spentMonthlyCents: 5_000 }),
        ag({ id: "a-hot", name: "Hot", budgetMonthlyCents: 10_000, spentMonthlyCents: 9_500 }),
        ag({ id: "a-dangerzone", name: "Over", budgetMonthlyCents: 10_000, spentMonthlyCents: 11_000 }),
      ],
      issues: [],
      incidents: [],
    });
    const ids = s.agentsOverBudget.map((a) => a.id).sort();
    expect(ids).toEqual(["a-dangerzone", "a-hot"]);
    const hot = s.agentsOverBudget.find((a) => a.id === "a-hot")!;
    expect(hot.utilizationPercent).toBeCloseTo(95, 5);
  });

  it("skips agents with zero budget", () => {
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [ag({ id: "x", name: "X", budgetMonthlyCents: 0, spentMonthlyCents: 1000 })],
      issues: [],
      incidents: [],
    });
    expect(s.agentsOverBudget).toEqual([]);
  });

  it("pulls company budget/spent from dashboard.company when provided", () => {
    const dashboard: DashboardLike = {
      company: {
        budgetMonthlyCents: 50_000,
        spentMonthlyCents: 12_500,
      },
    };
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [],
      issues: [],
      incidents: [],
      dashboard,
    });
    expect(s.budgetMonthlyCents).toBe(50_000);
    expect(s.spentMonthlyCents).toBe(12_500);
    expect(s.budgetUtilizationPercent).toBeCloseTo(25, 5);
  });

  it("falls back to monthSpendCents when the nested company.spentMonthlyCents is absent", () => {
    const dashboard: DashboardLike = {
      company: { budgetMonthlyCents: 20_000 },
      monthSpendCents: 3_000,
    };
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [],
      issues: [],
      incidents: [],
      dashboard,
    });
    expect(s.spentMonthlyCents).toBe(3_000);
    expect(s.budgetUtilizationPercent).toBeCloseTo(15, 5);
  });

  it("utilization is 0 when the company has no budget set", () => {
    const s = summarizeStatus({
      companyId: "c",
      now: REFERENCE_NOW,
      agents: [],
      issues: [],
      incidents: [],
    });
    expect(s.budgetUtilizationPercent).toBe(0);
  });
});

describe("formatStatus", () => {
  const base = summarizeStatus({
    companyId: "company-abc",
    now: REFERENCE_NOW,
    agents: [ag({ status: "idle" }), ag({ status: "running" })],
    issues: [
      { status: "done", updatedAt: LATER_TODAY, identifier: "ISS-7", title: "ship" },
    ],
    incidents: [
      { classification: "moderate", detectedAt: LATER_TODAY },
    ],
    dashboard: {
      company: { budgetMonthlyCents: 10_000, spentMonthlyCents: 2_500 },
    },
  });

  it("returns valid JSON when requested", () => {
    const out = formatStatus(base, { json: true });
    const parsed = JSON.parse(out);
    expect(parsed.companyId).toBe("company-abc");
  });

  it("human output shows every section", () => {
    const out = formatStatus(base);
    expect(out).toMatch(/Company: company-abc/);
    expect(out).toMatch(/Completed issues: 1/);
    expect(out).toMatch(/ISS-7/);
    expect(out).toMatch(/Emotional interventions: 1/);
    expect(out).toMatch(/moderate: 1/);
    expect(out).toMatch(/Company spent: \$25\.00 \/ \$100\.00/);
    expect(out).toMatch(/Utilization: 25\.0%/);
    expect(out).toMatch(/Agents: 2/);
    expect(out).toMatch(/idle: 1/);
    expect(out).toMatch(/running: 1/);
  });
});
