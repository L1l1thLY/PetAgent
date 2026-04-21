import { describe, it, expect } from "vitest";
import { craftIntervention } from "./intervention_crafter.js";

describe("craftIntervention", () => {
  it("addresses frustration with a structured-hypothesis prompt at mild severity", () => {
    const text = craftIntervention("mild", ["frustration"]);
    expect(text).toMatch(/list/i);
    expect(text).toMatch(/(verified|confirmed)/i);
    expect(text.length).toBeGreaterThan(40);
  });

  it("distinguishes low_confidence at mild from frustration at mild", () => {
    const a = craftIntervention("mild", ["frustration"]);
    const b = craftIntervention("mild", ["low_confidence"]);
    expect(a).not.toBe(b);
  });

  it("at moderate severity emphasises stepping back / re-scoping", () => {
    const text = craftIntervention("moderate", ["frustration", "low_confidence"]);
    expect(text).toMatch(/(step back|reconsider|smaller|narrower|reframe)/i);
  });

  it("at severe severity hands off (asks for human help / pause-style language)", () => {
    const text = craftIntervention("severe", ["giving_up"]);
    expect(text).toMatch(/(pause|stop|reset|fresh|help)/i);
  });

  it("returns a generic prompt when signals are empty but severity is mild", () => {
    const text = craftIntervention("mild", []);
    expect(text.length).toBeGreaterThan(20);
  });

  it("never returns an empty string for any active severity", () => {
    for (const sev of ["mild", "moderate", "severe"] as const) {
      for (const sig of [
        "frustration",
        "low_confidence",
        "confusion",
        "over_cautious",
        "giving_up",
        "angry",
        "unknown_signal_xyz",
      ]) {
        const t = craftIntervention(sev, [sig]);
        expect(t.length, `severity=${sev}, signal=${sig}`).toBeGreaterThan(0);
      }
    }
  });

  it("addresses confusion with a comprehension-check prompt at mild severity", () => {
    const text = craftIntervention("mild", ["confusion"]);
    expect(text).toMatch(/(restate|paraphrase|in your own words|understand)/i);
  });

  it("addresses over_cautious with execute-now language at mild severity", () => {
    const text = craftIntervention("mild", ["over_cautious"]);
    expect(text).toMatch(/(execute|proceed|act|just do)/i);
  });
});
