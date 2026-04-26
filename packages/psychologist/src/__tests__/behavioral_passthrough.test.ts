import { describe, it, expect } from "vitest";
import { BehavioralPassthroughClassifier } from "../classifier.js";

describe("BehavioralPassthroughClassifier", () => {
  it("returns mild recommended_intervention regardless of input", async () => {
    const c = new BehavioralPassthroughClassifier();
    const r = await c.classify(["a", "b"], { issueContext: "anything" });
    expect(r.recommended_intervention).toBe("mild");
  });

  it("returns the constant signal label for downstream aggregation", async () => {
    const c = new BehavioralPassthroughClassifier();
    const r = await c.classify([], { issueContext: "x" });
    expect(r.signals).toEqual(["behavioral_passthrough"]);
  });

  it("returns a fixed mid distress level so incidents have meaningful confidence", async () => {
    const c = new BehavioralPassthroughClassifier();
    const r = await c.classify([], { issueContext: "x" });
    expect(r.distress_level).toBeCloseTo(0.5, 5);
  });
});
