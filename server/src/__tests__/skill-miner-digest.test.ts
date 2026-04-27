import { describe, it, expect } from "vitest";
import { isoWeekToRange, rangeToIsoWeek } from "../skill-miner/digest.js";

describe("isoWeekToRange", () => {
  it("returns Monday → next Monday for a known ISO week", () => {
    const r = isoWeekToRange("2026-W17");
    expect(r.weekStart.toISOString().slice(0, 10)).toBe("2026-04-20");
    expect(r.weekEnd.toISOString().slice(0, 10)).toBe("2026-04-27");
  });

  it("week 1 of 2026 starts 2025-12-29 (per ISO 8601 — week containing first Thursday)", () => {
    const r = isoWeekToRange("2026-W01");
    expect(r.weekStart.toISOString().slice(0, 10)).toBe("2025-12-29");
  });

  it("rejects malformed input", () => {
    expect(() => isoWeekToRange("nope")).toThrow();
    expect(() => isoWeekToRange("2026-W")).toThrow();
    expect(() => isoWeekToRange("2026-W99")).toThrow();
  });

  it("accepts single-digit week numbers", () => {
    const r = isoWeekToRange("2026-W3");
    expect(r.weekStart.getUTCDay()).toBe(1); // Monday
  });
});

describe("rangeToIsoWeek", () => {
  it("inverts isoWeekToRange for a Monday inside a week", () => {
    const r = isoWeekToRange("2026-W17");
    expect(rangeToIsoWeek(r.weekStart)).toBe("2026-W17");
  });

  it("returns the right week for mid-week dates", () => {
    expect(rangeToIsoWeek(new Date("2026-04-23T12:00:00Z"))).toBe("2026-W17");
  });

  it("rolls into next year correctly (Dec 29 2025 → 2026-W01)", () => {
    expect(rangeToIsoWeek(new Date("2025-12-29T00:00:00Z"))).toBe("2026-W01");
  });
});
