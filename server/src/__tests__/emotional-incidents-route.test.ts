import { describe, it, expect } from "vitest";
import type { TransparencyGamma } from "@petagent/shared";
import {
  parseSinceDays,
  parseLimit,
  windowStart,
  applyGamma,
  type IncidentRow,
} from "../routes/emotional-incidents.js";

describe("parseSinceDays", () => {
  it("returns default (30) for missing/non-numeric input", () => {
    expect(parseSinceDays(undefined)).toBe(30);
    expect(parseSinceDays("not a number")).toBe(30);
  });

  it("clamps below MIN (1) and above MAX (365)", () => {
    expect(parseSinceDays("-5")).toBe(1);
    expect(parseSinceDays("0")).toBe(1);
    expect(parseSinceDays("10000")).toBe(365);
  });

  it("truncates fractional values", () => {
    expect(parseSinceDays("2.9")).toBe(2);
  });

  it("accepts an in-range numeric", () => {
    expect(parseSinceDays("7")).toBe(7);
    expect(parseSinceDays(90)).toBe(90);
  });
});

describe("parseLimit", () => {
  it("returns default (100) for missing/non-numeric input", () => {
    expect(parseLimit(undefined)).toBe(100);
    expect(parseLimit("abc")).toBe(100);
  });

  it("clamps below MIN (1) and above MAX (500)", () => {
    expect(parseLimit("0")).toBe(1);
    expect(parseLimit("100000")).toBe(500);
  });

  it("truncates fractional values", () => {
    expect(parseLimit("50.9")).toBe(50);
  });
});

describe("windowStart", () => {
  it("returns the timestamp N days before `now`", () => {
    const now = new Date("2026-04-21T12:00:00Z");
    const start = windowStart(now, 7);
    expect(start.toISOString()).toBe("2026-04-14T12:00:00.000Z");
  });

  it("handles 1-day window", () => {
    const now = new Date("2026-04-21T00:00:00Z");
    const start = windowStart(now, 1);
    expect(start.toISOString()).toBe("2026-04-20T00:00:00.000Z");
  });
});

describe("applyGamma", () => {
  function makeRow(overrides: Partial<IncidentRow> = {}): IncidentRow {
    return {
      id: "inc_1",
      companyId: "c1",
      agentId: "a1",
      issueId: null,
      runId: null,
      detectedAt: new Date("2026-04-21T00:00:00Z"),
      signalType: "both",
      classification: "moderate",
      confidence: 0.7,
      signalPayload: { behavioral: { severity: "moderate" }, classifier: { distress_level: 0.7 } },
      interventionKind: "instructions_inject_with_comment",
      interventionPayload: { content: "You've tried a few approaches and they didn't work." },
      dispatchedAt: null,
      outcome: "pending",
      outcomeNotes: null,
      outcomeResolvedAt: null,
      ...overrides,
    };
  }

  it("transparent: returns the row unchanged (both payloads included)", () => {
    const row = makeRow();
    const out = applyGamma(row, "transparent");
    expect(out).toBe(row);
    expect(out.interventionPayload).toEqual({
      content: "You've tried a few approaches and they didn't work.",
    });
    expect(out.signalPayload).toEqual({
      behavioral: { severity: "moderate" },
      classifier: { distress_level: 0.7 },
    });
  });

  it("semi: redacts interventionPayload but keeps signalPayload and interventionKind", () => {
    const out = applyGamma(makeRow(), "semi");
    expect(out.interventionPayload).toEqual({
      redacted: true,
      note: "hidden by transparency policy (spec §7.4)",
    });
    expect(out.signalPayload).toEqual({
      behavioral: { severity: "moderate" },
      classifier: { distress_level: 0.7 },
    });
    expect(out.interventionKind).toBe("instructions_inject_with_comment");
    expect(out.classification).toBe("moderate");
  });

  it("opaque: redacts BOTH interventionPayload AND signalPayload", () => {
    const out = applyGamma(makeRow(), "opaque");
    expect(out.interventionPayload).toEqual({
      redacted: true,
      note: "hidden by transparency policy (spec §7.4)",
    });
    expect(out.signalPayload).toEqual({
      redacted: true,
      note: "hidden by transparency policy (spec §7.4)",
    });
    // Audit shape is preserved: ids, dates, outcome, classification, kind.
    expect(out.id).toBe("inc_1");
    expect(out.classification).toBe("moderate");
    expect(out.interventionKind).toBe("instructions_inject_with_comment");
    expect(out.outcome).toBe("pending");
  });

  it("preserves nullness when the underlying payload was already null", () => {
    const row = makeRow({ signalPayload: null, interventionPayload: null });
    const out = applyGamma(row, "opaque");
    expect(out.signalPayload).toBeNull();
    expect(out.interventionPayload).toBeNull();
  });

  it("does not mutate the input row (all γ modes)", () => {
    for (const gamma of ["opaque", "semi", "transparent"] as TransparencyGamma[]) {
      const row = makeRow();
      applyGamma(row, gamma);
      expect(row.interventionPayload).toEqual({
        content: "You've tried a few approaches and they didn't work.",
      });
      expect(row.signalPayload).toEqual({
        behavioral: { severity: "moderate" },
        classifier: { distress_level: 0.7 },
      });
    }
  });
});
