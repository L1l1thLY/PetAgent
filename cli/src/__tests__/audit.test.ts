import { describe, it, expect } from "vitest";
import {
  buildAuditReport,
  formatAuditReport,
  type EmotionalIncidentRow,
} from "../commands/audit.js";

function row(overrides: Partial<EmotionalIncidentRow> = {}): EmotionalIncidentRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    agentId: "22222222-2222-2222-2222-222222222222",
    classification: "moderate",
    interventionKind: "instructions_inject",
    outcome: "recovered",
    detectedAt: "2026-04-21T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildAuditReport", () => {
  it("returns zero counts for an empty window", () => {
    const report = buildAuditReport([], 30);
    expect(report.total).toBe(0);
    expect(report.byClassification).toEqual({});
    expect(report.byOutcome).toEqual({});
    expect(report.byIntervention).toEqual({});
    expect(report.windowSinceDays).toBe(30);
  });

  it("buckets by classification, outcome, and intervention kind", () => {
    const rows = [
      row({ classification: "mild", outcome: "recovered" }),
      row({ classification: "moderate", outcome: "recovered" }),
      row({ classification: "moderate", outcome: "escalated", interventionKind: "pause_therapy" }),
      row({ classification: "severe", outcome: "pending", interventionKind: "pause_therapy" }),
    ];
    const report = buildAuditReport(rows, 30);
    expect(report.total).toBe(4);
    expect(report.byClassification).toEqual({ mild: 1, moderate: 2, severe: 1 });
    expect(report.byOutcome).toEqual({ recovered: 2, escalated: 1, pending: 1 });
    expect(report.byIntervention).toEqual({ instructions_inject: 2, pause_therapy: 2 });
  });

  it("treats missing classification/outcome/intervention as unknown/pending/none", () => {
    const report = buildAuditReport(
      [row({ classification: null, outcome: null, interventionKind: null })],
      14,
    );
    expect(report.byClassification.unknown).toBe(1);
    expect(report.byOutcome.pending).toBe(1);
    expect(report.byIntervention.none).toBe(1);
  });

  it("carries rows through so callers can render detail", () => {
    const rows = [row({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" })];
    const report = buildAuditReport(rows, 7);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});

describe("formatAuditReport", () => {
  const sample = buildAuditReport(
    [
      row({ classification: "moderate", outcome: "recovered" }),
      row({ classification: "severe", outcome: "pending", interventionKind: "pause_therapy" }),
    ],
    30,
  );

  it("renders JSON when json=true", () => {
    const out = formatAuditReport(sample, { json: true });
    const parsed = JSON.parse(out);
    expect(parsed.total).toBe(2);
    expect(parsed.byClassification.moderate).toBe(1);
  });

  it("human output shows window, totals, buckets, and per-incident lines", () => {
    const out = formatAuditReport(sample);
    expect(out).toMatch(/last 30 days/);
    expect(out).toMatch(/Total incidents: 2/);
    expect(out).toMatch(/By classification:/);
    expect(out).toMatch(/moderate: 1/);
    expect(out).toMatch(/severe: 1/);
    expect(out).toMatch(/By outcome:/);
    expect(out).toMatch(/recovered: 1/);
    expect(out).toMatch(/By intervention kind:/);
    expect(out).toMatch(/pause_therapy: 1/);
    expect(out).toMatch(/Incidents:/);
    expect(out).toMatch(/id=11111111/);
  });

  it("says '(no incidents in window)' when total is 0", () => {
    const empty = buildAuditReport([], 7);
    const out = formatAuditReport(empty);
    expect(out).toMatch(/\(no incidents in window\)/);
  });

  it("omits at= prefix when detectedAt is missing/invalid", () => {
    const r = buildAuditReport(
      [row({ detectedAt: null })],
      30,
    );
    const out = formatAuditReport(r);
    expect(out).not.toMatch(/at=null/);
    expect(out).not.toMatch(/at=Invalid/);
  });
});
