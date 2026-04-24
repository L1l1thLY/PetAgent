import { describe, it, expect } from "vitest";
import type { EmotionalIncident } from "../api/emotional-incidents";
import {
  filterIncidents,
  toCsv,
  collectFilterOptions,
  interventionContentPreview,
} from "./interventions-export";

function inc(overrides: Partial<EmotionalIncident> = {}): EmotionalIncident {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    companyId: "company-1",
    agentId: "agent-1",
    issueId: null,
    runId: null,
    detectedAt: "2026-04-23T10:00:00.000Z",
    signalType: "both",
    classification: "moderate",
    confidence: 0.75,
    signalPayload: null,
    interventionKind: "instructions_inject",
    interventionPayload: { content: "take a breath" },
    dispatchedAt: "2026-04-23T10:00:05.000Z",
    outcome: "recovered",
    outcomeNotes: "heartbeat.status=succeeded",
    outcomeResolvedAt: "2026-04-23T10:05:00.000Z",
    ...overrides,
  };
}

describe("filterIncidents", () => {
  it("returns everything when the filter is empty", () => {
    const list = [inc(), inc({ id: "22222222-2222-2222-2222-222222222222" })];
    expect(filterIncidents(list, {})).toHaveLength(2);
  });

  it("filters by agentId", () => {
    const a = inc({ agentId: "agent-A" });
    const b = inc({ agentId: "agent-B" });
    expect(filterIncidents([a, b], { agentId: "agent-A" })).toEqual([a]);
  });

  it("filters by classification", () => {
    const m = inc({ classification: "moderate" });
    const s = inc({ classification: "severe" });
    expect(filterIncidents([m, s], { classification: "severe" })).toEqual([s]);
  });

  it("filters by outcome", () => {
    const r = inc({ outcome: "recovered" });
    const e = inc({ outcome: "escalated" });
    expect(filterIncidents([r, e], { outcome: "escalated" })).toEqual([e]);
  });

  it("search is case-insensitive and matches across multiple fields", () => {
    const a = inc({ id: "abc-alpha", agentId: "x", classification: "moderate" });
    const b = inc({ id: "def-beta", agentId: "x", classification: "severe" });
    expect(filterIncidents([a, b], { search: "ALPHA" })).toEqual([a]);
    expect(filterIncidents([a, b], { search: "severe" })).toEqual([b]);
  });

  it("combines filters with AND semantics", () => {
    const hit = inc({ agentId: "a1", classification: "moderate", outcome: "recovered" });
    const miss = inc({ agentId: "a1", classification: "severe", outcome: "recovered" });
    expect(
      filterIncidents([hit, miss], { agentId: "a1", classification: "moderate" }),
    ).toEqual([hit]);
  });
});

describe("toCsv", () => {
  it("emits a header row even when the list is empty", () => {
    const csv = toCsv([]);
    expect(csv).toMatch(/^id,detected_at,/);
  });

  it("emits one row per incident with the expected column order", () => {
    const csv = toCsv([inc({ id: "row-1" })]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    const cells = lines[1].split(",");
    expect(cells[0]).toBe("row-1");
    expect(cells[6]).toBe("moderate");
    expect(cells[10]).toBe("recovered");
  });

  it("quotes + escapes values that contain commas, quotes, or newlines", () => {
    const csv = toCsv([
      inc({
        id: "weird",
        outcomeNotes: 'She said "hi", then left\nnext day',
      }),
    ]);
    expect(csv).toContain('"She said ""hi"", then left\nnext day"');
  });

  it("renders null / undefined cells as the empty string", () => {
    const csv = toCsv([inc({ issueId: null, runId: null, outcomeNotes: null })]);
    const lines = csv.split("\n");
    const cells = lines[1].split(",");
    expect(cells[3]).toBe("");
    expect(cells[4]).toBe("");
    expect(cells[11]).toBe("");
  });
});

describe("collectFilterOptions", () => {
  it("gathers unique classifications / outcomes / agents in sorted order", () => {
    const list = [
      inc({ agentId: "a1", classification: "moderate", outcome: "recovered" }),
      inc({ agentId: "a2", classification: "severe", outcome: "pending" }),
      inc({ agentId: "a1", classification: "moderate", outcome: "recovered" }),
    ];
    const opts = collectFilterOptions(list);
    expect(opts.classifications).toEqual(["moderate", "severe"]);
    expect(opts.outcomes).toEqual(["pending", "recovered"]);
    expect(opts.agents).toEqual(["a1", "a2"]);
  });

  it("omits null classifications and outcomes from the option lists", () => {
    const opts = collectFilterOptions([inc({ classification: null, outcome: null })]);
    expect(opts.classifications).toEqual([]);
    expect(opts.outcomes).toEqual([]);
  });
});

describe("interventionContentPreview", () => {
  it("returns the content field when present", () => {
    expect(interventionContentPreview(inc())).toBe("take a breath");
  });

  it("returns '[redacted]' marker when the server redacted the payload", () => {
    const redacted = inc({
      interventionPayload: { redacted: true, note: "hidden by transparency policy (spec §7.4)" },
    });
    expect(interventionContentPreview(redacted)).toMatch(/redacted/);
  });

  it("returns empty string when the payload is null", () => {
    expect(interventionContentPreview(inc({ interventionPayload: null }))).toBe("");
  });

  it("stringifies the payload when it has neither `content` nor `redacted`", () => {
    const payload = inc({ interventionPayload: { something: "else" } });
    expect(interventionContentPreview(payload)).toBe(JSON.stringify({ something: "else" }));
  });
});
