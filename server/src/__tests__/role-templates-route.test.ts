import { describe, it, expect } from "vitest";
import { takeFirstLines } from "../routes/role-templates.js";

describe("takeFirstLines", () => {
  it("returns the whole string when it has fewer lines than requested", () => {
    expect(takeFirstLines("one\ntwo", 5)).toBe("one\ntwo");
  });

  it("truncates to the first N lines", () => {
    expect(takeFirstLines("a\nb\nc\nd\ne\nf", 3)).toBe("a\nb\nc");
  });

  it("returns the empty string when N is 0", () => {
    expect(takeFirstLines("anything", 0)).toBe("");
  });

  it("preserves line breaks in the truncated output", () => {
    const out = takeFirstLines("line1\nline2\nline3", 2);
    expect(out).toBe("line1\nline2");
    expect(out.split("\n")).toHaveLength(2);
  });
});
