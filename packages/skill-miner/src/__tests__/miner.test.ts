import { describe, it, expect, vi } from "vitest";
import { mineSkills } from "../miner.js";
import type { LLMTextTransport } from "@petagent/llm-providers";
import type { NoteSummary } from "../types.js";

function makeNotes(count: number, agentId = "a1"): NoteSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i + 1}`,
    agentId,
    noteType: "task",
    body: `Note body ${i + 1}: did some work involving X and Y.`,
  }));
}

const window = { start: new Date("2026-04-19"), end: new Date("2026-04-26") };

function fakeTransport(response: string): LLMTextTransport {
  return {
    send: vi.fn().mockResolvedValue(response),
  };
}

describe("mineSkills: short-circuits", () => {
  it("returns empty when notes is empty", async () => {
    const transport = fakeTransport("[]");
    const r = await mineSkills({
      companyId: "c1",
      notes: [],
      window,
      transport,
      model: "test",
    });
    expect(r.candidates).toEqual([]);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("returns empty when notes < frequencyThreshold (default 3)", async () => {
    const transport = fakeTransport("[]");
    const r = await mineSkills({
      companyId: "c1",
      notes: makeNotes(2),
      window,
      transport,
      model: "test",
    });
    expect(r.candidates).toEqual([]);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("calls LLM when notes.length >= threshold", async () => {
    const transport = fakeTransport("[]");
    await mineSkills({
      companyId: "c1",
      notes: makeNotes(5),
      window,
      transport,
      model: "test",
    });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});

describe("mineSkills: prompt + transport plumbing", () => {
  it("passes the configured model through to transport.send", async () => {
    const transport = fakeTransport("[]");
    await mineSkills({
      companyId: "c1",
      notes: makeNotes(5),
      window,
      transport,
      model: "moonshot-v1-32k",
    });
    const arg = (transport.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.model).toBe("moonshot-v1-32k");
  });

  it("uses configured maxTokens (default 4096)", async () => {
    const transport = fakeTransport("[]");
    await mineSkills({
      companyId: "c1",
      notes: makeNotes(5),
      window,
      transport,
      model: "m",
      maxTokens: 8192,
    });
    const arg = (transport.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.maxTokens).toBe(8192);
  });

  it("system prompt mentions the configured frequencyThreshold", async () => {
    const transport = fakeTransport("[]");
    await mineSkills({
      companyId: "c1",
      notes: makeNotes(5),
      window,
      transport,
      model: "m",
      frequencyThreshold: 5,
    });
    const arg = (transport.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.system).toContain("AT LEAST 5");
  });

  it("user message includes every note id", async () => {
    const transport = fakeTransport("[]");
    const notes = makeNotes(5);
    await mineSkills({
      companyId: "c1",
      notes,
      window,
      transport,
      model: "m",
    });
    const arg = (transport.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    for (const n of notes) expect(arg.userMessage).toContain(n.id);
  });
});

describe("mineSkills: result handling", () => {
  it("returns parsed candidates when LLM responds well", async () => {
    const transport = fakeTransport(
      JSON.stringify([
        {
          name: "good-pattern",
          title: "Good pattern",
          body: "Step 1...",
          sourceNoteIds: ["n1", "n2", "n3"],
          patternFrequency: 3,
        },
      ]),
    );
    const r = await mineSkills({
      companyId: "c1",
      notes: makeNotes(5),
      window,
      transport,
      model: "m",
    });
    expect(r.fellBackToEmpty).toBe(false);
    expect(r.candidates).toHaveLength(1);
    expect(r.rawLlmResponse).toContain("good-pattern");
  });

  it("filters out candidates below frequencyThreshold", async () => {
    const transport = fakeTransport(
      JSON.stringify([
        {
          name: "low-frequency",
          title: "x",
          body: "y",
          sourceNoteIds: ["n1", "n2"],
          patternFrequency: 2,
        },
        {
          name: "high-frequency",
          title: "x",
          body: "y",
          sourceNoteIds: ["n1", "n2", "n3", "n4"],
          patternFrequency: 4,
        },
      ]),
    );
    const r = await mineSkills({
      companyId: "c1",
      notes: makeNotes(5),
      window,
      transport,
      model: "m",
      frequencyThreshold: 3,
    });
    expect(r.candidates.map((c) => c.name)).toEqual(["high-frequency"]);
  });

  it("returns fellBackToEmpty=true when LLM throws", async () => {
    const transport: LLMTextTransport = {
      send: vi.fn().mockRejectedValue(new Error("rate limited")),
    };
    const warnings: string[] = [];
    const r = await mineSkills({
      companyId: "c1",
      notes: makeNotes(5),
      window,
      transport,
      model: "m",
      logger: { warn: (m) => warnings.push(m) },
    });
    expect(r.candidates).toEqual([]);
    expect(r.fellBackToEmpty).toBe(true);
    expect(warnings.some((w) => /rate limited/.test(w))).toBe(true);
  });

  it("returns fellBackToEmpty=true when LLM returns malformed JSON", async () => {
    const transport = fakeTransport("not even close to json");
    const r = await mineSkills({
      companyId: "c1",
      notes: makeNotes(5),
      window,
      transport,
      model: "m",
    });
    expect(r.candidates).toEqual([]);
    expect(r.fellBackToEmpty).toBe(true);
  });
});
