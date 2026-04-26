import { describe, it, expect } from "vitest";
import { parseLlmResponse } from "../parse.js";
import type { NoteSummary } from "../types.js";

const sampleNotes: NoteSummary[] = [
  { id: "n1", agentId: "a1", noteType: "task", body: "x" },
  { id: "n2", agentId: "a1", noteType: "task", body: "y" },
  { id: "n3", agentId: "a1", noteType: "task", body: "z" },
  { id: "n4", agentId: "a2", noteType: "task", body: "w" },
];

const validRawArray = JSON.stringify([
  {
    name: "test-skill",
    title: "Test skill",
    body: "Step 1: do something. Step 2: do more.",
    rationale: "Saw this pattern repeatedly",
    sourceNoteIds: ["n1", "n2", "n3"],
    patternFrequency: 3,
    agentId: "a1",
  },
]);

describe("parseLlmResponse: clean JSON", () => {
  it("parses a valid array", () => {
    const { candidates, fellBackToEmpty } = parseLlmResponse(validRawArray, sampleNotes);
    expect(fellBackToEmpty).toBe(false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe("test-skill");
    expect(candidates[0].sourceNoteIds).toEqual(["n1", "n2", "n3"]);
    expect(candidates[0].agentId).toBe("a1");
  });

  it("returns [] when LLM returns []", () => {
    const { candidates, fellBackToEmpty } = parseLlmResponse("[]", sampleNotes);
    expect(candidates).toEqual([]);
    expect(fellBackToEmpty).toBe(false);
  });
});

describe("parseLlmResponse: dirty inputs", () => {
  it("strips ```json fences", () => {
    const wrapped = "```json\n" + validRawArray + "\n```";
    const { candidates } = parseLlmResponse(wrapped, sampleNotes);
    expect(candidates).toHaveLength(1);
  });

  it("strips bare ``` fences", () => {
    const wrapped = "```\n" + validRawArray + "\n```";
    const { candidates } = parseLlmResponse(wrapped, sampleNotes);
    expect(candidates).toHaveLength(1);
  });

  it("tolerates leading prose before the array", () => {
    const wrapped = "Here are the patterns I found:\n\n" + validRawArray;
    const { candidates } = parseLlmResponse(wrapped, sampleNotes);
    expect(candidates).toHaveLength(1);
  });

  it("tolerates trailing prose after the array", () => {
    const wrapped = validRawArray + "\n\nHope this helps!";
    const { candidates } = parseLlmResponse(wrapped, sampleNotes);
    expect(candidates).toHaveLength(1);
  });

  it("returns fellBackToEmpty=true when no JSON array present", () => {
    const { candidates, fellBackToEmpty } = parseLlmResponse(
      "I cannot find any patterns.",
      sampleNotes,
    );
    expect(candidates).toEqual([]);
    expect(fellBackToEmpty).toBe(true);
  });

  it("returns fellBackToEmpty=true when JSON is malformed", () => {
    const { candidates, fellBackToEmpty } = parseLlmResponse("[{broken", sampleNotes);
    expect(candidates).toEqual([]);
    expect(fellBackToEmpty).toBe(true);
  });

  it("returns fellBackToEmpty=true when input is empty", () => {
    const { candidates, fellBackToEmpty } = parseLlmResponse("", sampleNotes);
    expect(candidates).toEqual([]);
    expect(fellBackToEmpty).toBe(true);
  });
});

describe("parseLlmResponse: per-candidate validation", () => {
  it("drops candidates missing required fields", () => {
    const raw = JSON.stringify([
      // valid
      {
        name: "good",
        title: "Good",
        body: "ok",
        sourceNoteIds: ["n1", "n2"],
        patternFrequency: 2,
      },
      // missing name
      { title: "Bad", body: "ok", sourceNoteIds: ["n1"] },
      // empty body
      { name: "x", title: "y", body: "  ", sourceNoteIds: ["n1"] },
    ]);
    const { candidates } = parseLlmResponse(raw, sampleNotes);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe("good");
  });

  it("filters sourceNoteIds to only those that exist", () => {
    const raw = JSON.stringify([
      {
        name: "x",
        title: "Y",
        body: "Z",
        sourceNoteIds: ["n1", "ghost-id", "n2"],
        patternFrequency: 3,
      },
    ]);
    const { candidates } = parseLlmResponse(raw, sampleNotes);
    expect(candidates[0].sourceNoteIds).toEqual(["n1", "n2"]);
  });

  it("drops candidate when no source note ids survive validation", () => {
    const raw = JSON.stringify([
      {
        name: "x",
        title: "Y",
        body: "Z",
        sourceNoteIds: ["ghost1", "ghost2"],
        patternFrequency: 2,
      },
    ]);
    const { candidates } = parseLlmResponse(raw, sampleNotes);
    expect(candidates).toEqual([]);
  });

  it("derives agentId=null when source notes span multiple agents", () => {
    const raw = JSON.stringify([
      {
        name: "x",
        title: "Y",
        body: "Z",
        sourceNoteIds: ["n1", "n4"], // a1 + a2
        patternFrequency: 2,
        agentId: "a1", // claim ignored — agentId only honored when all match
      },
    ]);
    const { candidates } = parseLlmResponse(raw, sampleNotes);
    expect(candidates[0].agentId).toBeNull();
  });

  it("keeps agentId when all source notes share one agent", () => {
    const raw = JSON.stringify([
      {
        name: "x",
        title: "Y",
        body: "Z",
        sourceNoteIds: ["n1", "n2", "n3"],
        patternFrequency: 3,
      },
    ]);
    const { candidates } = parseLlmResponse(raw, sampleNotes);
    expect(candidates[0].agentId).toBe("a1");
  });

  it("slugifies name (lowercases, strips invalid chars)", () => {
    const raw = JSON.stringify([
      {
        name: "Handle Stripe Webhook!",
        title: "x",
        body: "y",
        sourceNoteIds: ["n1"],
      },
    ]);
    const { candidates } = parseLlmResponse(raw, sampleNotes);
    expect(candidates[0].name).toBe("handle-stripe-webhook");
  });
});
