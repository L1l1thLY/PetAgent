import { describe, it, expect } from "vitest";
import type { Agent, HeartbeatRun } from "@petagent/shared";
import {
  summarizeHealth,
  formatHealthSummary,
  type EmotionalIncidentSummary,
} from "../commands/health.js";

function a(status: Agent["status"]): Pick<Agent, "status"> {
  return { status };
}

function r(status: HeartbeatRun["status"]): Pick<HeartbeatRun, "status"> {
  return { status };
}

describe("summarizeHealth", () => {
  it("counts agents by status", () => {
    const s = summarizeHealth([a("idle"), a("idle"), a("running")], [], null);
    expect(s.agentCount).toBe(3);
    expect(s.agentsByStatus.idle).toBe(2);
    expect(s.agentsByStatus.running).toBe(1);
  });

  it("computes success rate over finished runs only (ignores queued/running)", () => {
    const runs = [
      r("succeeded"),
      r("succeeded"),
      r("failed"),
      r("queued"),
      r("running"),
    ];
    const s = summarizeHealth([], runs, null);
    expect(s.runsTotal).toBe(5);
    expect(s.runsByStatus.succeeded).toBe(2);
    expect(s.runsByStatus.failed).toBe(1);
    expect(s.runsByStatus.queued).toBe(1);
    expect(s.runsByStatus.running).toBe(1);
    expect(s.successRate).toBeCloseTo(2 / 3, 5);
    expect(s.recentFailures).toBe(1);
  });

  it("counts timed_out runs as failures", () => {
    const s = summarizeHealth([], [r("failed"), r("timed_out"), r("succeeded")], null);
    expect(s.recentFailures).toBe(2);
    expect(s.successRate).toBeCloseTo(1 / 3, 5);
  });

  it("successRate is 0 when there are no finished runs", () => {
    const s = summarizeHealth([], [r("queued"), r("running")], null);
    expect(s.successRate).toBe(0);
  });

  it("reports incidentsAvailable=false when incidents is null", () => {
    const s = summarizeHealth([], [], null);
    expect(s.incidentsAvailable).toBe(false);
    expect(s.incidentsTotal).toBe(0);
  });

  it("reports incidentsAvailable=true and bucketises by classification+outcome", () => {
    const incidents: EmotionalIncidentSummary[] = [
      { id: "1", agentId: "a", classification: "moderate", outcome: "recovered" },
      { id: "2", agentId: "a", classification: "moderate", outcome: "pending" },
      { id: "3", agentId: "b", classification: "severe", outcome: "escalated" },
    ];
    const s = summarizeHealth([], [], incidents);
    expect(s.incidentsAvailable).toBe(true);
    expect(s.incidentsTotal).toBe(3);
    expect(s.incidentsByClassification.moderate).toBe(2);
    expect(s.incidentsByClassification.severe).toBe(1);
    expect(s.incidentsByOutcome.recovered).toBe(1);
    expect(s.incidentsByOutcome.pending).toBe(1);
    expect(s.incidentsByOutcome.escalated).toBe(1);
  });

  it("falls back to severity when classification is absent", () => {
    const s = summarizeHealth(
      [],
      [],
      [{ id: "1", agentId: "a", severity: "mild" }],
    );
    expect(s.incidentsByClassification.mild).toBe(1);
  });

  it("defaults outcome to 'pending' when absent", () => {
    const s = summarizeHealth(
      [],
      [],
      [{ id: "1", agentId: "a", classification: "mild" }],
    );
    expect(s.incidentsByOutcome.pending).toBe(1);
  });
});

describe("formatHealthSummary", () => {
  const sample = summarizeHealth(
    [a("idle"), a("running")],
    [r("succeeded"), r("failed")],
    [{ id: "1", agentId: "a", classification: "moderate", outcome: "recovered" }],
  );

  it("returns JSON when json=true", () => {
    const out = formatHealthSummary(sample, { json: true });
    const parsed = JSON.parse(out);
    expect(parsed.agentCount).toBe(2);
    expect(parsed.incidentsTotal).toBe(1);
  });

  it("human output includes agent totals, run stats, and incidents block", () => {
    const out = formatHealthSummary(sample);
    expect(out).toMatch(/Agents: 2 total/);
    expect(out).toMatch(/Recent runs: 2 sampled/);
    expect(out).toMatch(/success rate:/);
    expect(out).toMatch(/Emotional incidents: 1/);
    expect(out).toMatch(/moderate: 1/);
  });

  it("signals endpoint unavailability when incidentsAvailable=false", () => {
    const s = summarizeHealth([a("idle")], [r("succeeded")], null);
    const out = formatHealthSummary(s);
    expect(out).toMatch(/endpoint unavailable/);
  });
});
