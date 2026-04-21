import { describe, it, expect } from "vitest";
import {
  parseSinceDays,
  parseLimit,
  windowStart,
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
