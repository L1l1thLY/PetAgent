import { describe, it, expect } from "vitest";
import {
  CLASSIFIER_PROMPT,
  parseClassifierResponse,
  PromptedClassifier,
  type ClassifierTransport,
} from "./classifier.js";

function fakeTransport(responseText: string): ClassifierTransport {
  return {
    async send() {
      return responseText;
    },
  };
}

describe("CLASSIFIER_PROMPT", () => {
  it("declares the three intervention severity levels", () => {
    expect(CLASSIFIER_PROMPT).toMatch(/mild/);
    expect(CLASSIFIER_PROMPT).toMatch(/moderate/);
    expect(CLASSIFIER_PROMPT).toMatch(/severe/);
  });

  it("includes the JSON-only instruction", () => {
    expect(CLASSIFIER_PROMPT).toMatch(/Return ONLY the JSON/i);
  });
});

describe("parseClassifierResponse", () => {
  it("parses a well-formed response", () => {
    const text = JSON.stringify({
      distress_level: 0.7,
      signals: ["frustration", "low_confidence"],
      recommended_intervention: "moderate",
    });
    const r = parseClassifierResponse(text);
    expect(r.distress_level).toBe(0.7);
    expect(r.signals).toEqual(["frustration", "low_confidence"]);
    expect(r.recommended_intervention).toBe("moderate");
  });

  it("strips wrapping prose / code fences and parses the embedded JSON", () => {
    const text = "Here you go:\n```json\n" +
      JSON.stringify({
        distress_level: 0.4,
        signals: ["confusion"],
        recommended_intervention: "mild",
      }) +
      "\n```";
    const r = parseClassifierResponse(text);
    expect(r.recommended_intervention).toBe("mild");
  });

  it("clamps distress_level to [0,1]", () => {
    const r = parseClassifierResponse(
      JSON.stringify({
        distress_level: 1.7,
        signals: [],
        recommended_intervention: "none",
      }),
    );
    expect(r.distress_level).toBe(1);

    const r2 = parseClassifierResponse(
      JSON.stringify({
        distress_level: -0.3,
        signals: [],
        recommended_intervention: "none",
      }),
    );
    expect(r2.distress_level).toBe(0);
  });

  it("returns safe default on unparseable text", () => {
    const r = parseClassifierResponse("totally not json");
    expect(r.recommended_intervention).toBe("none");
    expect(r.signals).toEqual([]);
    expect(r.distress_level).toBe(0);
  });

  it("normalizes unknown intervention values to 'none'", () => {
    const r = parseClassifierResponse(
      JSON.stringify({
        distress_level: 0.5,
        signals: ["frustration"],
        recommended_intervention: "panic",
      }),
    );
    expect(r.recommended_intervention).toBe("none");
  });
});

describe("PromptedClassifier", () => {
  it("formats outputs/context into the user message and parses transport reply", async () => {
    let captured: { system?: string; userMessage?: string } = {};
    const transport: ClassifierTransport = {
      async send(args) {
        captured = { system: args.system, userMessage: args.userMessage };
        return JSON.stringify({
          distress_level: 0.6,
          signals: ["frustration"],
          recommended_intervention: "moderate",
        });
      },
    };
    const c = new PromptedClassifier(transport);
    const r = await c.classify(["I give up", "nothing works"], {
      issueContext: "deploy to vercel",
    });
    expect(r.recommended_intervention).toBe("moderate");
    expect(captured.system).toBe(CLASSIFIER_PROMPT);
    expect(captured.userMessage).toContain("I give up");
    expect(captured.userMessage).toContain("deploy to vercel");
    expect(captured.userMessage).toContain("---");
  });

  it("falls back to safe default when transport returns garbage", async () => {
    const c = new PromptedClassifier(fakeTransport("???"));
    const r = await c.classify(["hello"], { issueContext: "x" });
    expect(r.recommended_intervention).toBe("none");
  });
});
