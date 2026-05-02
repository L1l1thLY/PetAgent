import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_NOTE_EMBEDDING_DIMS,
  resolveAgentNoteEmbeddingDims,
} from "./embedding-dimensions.js";

describe("resolveAgentNoteEmbeddingDims", () => {
  it("defaults to 1536", () => {
    expect(resolveAgentNoteEmbeddingDims({})).toBe(DEFAULT_AGENT_NOTE_EMBEDDING_DIMS);
  });

  it("uses PETAGENT_EMBEDDING_DIMS when set", () => {
    expect(resolveAgentNoteEmbeddingDims({ PETAGENT_EMBEDDING_DIMS: "1024" })).toBe(1024);
  });

  it("rejects invalid dimensions", () => {
    expect(() =>
      resolveAgentNoteEmbeddingDims({ PETAGENT_EMBEDDING_DIMS: "1024.5" }),
    ).toThrow(/positive integer/);
    expect(() =>
      resolveAgentNoteEmbeddingDims({ PETAGENT_EMBEDDING_DIMS: "0" }),
    ).toThrow(/1 to 16000/);
    expect(() =>
      resolveAgentNoteEmbeddingDims({ PETAGENT_EMBEDDING_DIMS: "16001" }),
    ).toThrow(/1 to 16000/);
  });
});
