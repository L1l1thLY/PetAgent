import { describe, it, expect } from "vitest";
import { createEmbeddingService } from "../composition/embedding.js";

describe("createEmbeddingService", () => {
  it("returns stub-mode service when no OPENAI_API_KEY", () => {
    const result = createEmbeddingService({});
    expect(result.kind).toBe("stub");
    return result.service.embed("hello").then((vec) => {
      expect(vec).toHaveLength(1536);
    });
  });

  it("returns openai-mode service when OPENAI_API_KEY is set", () => {
    const result = createEmbeddingService({ OPENAI_API_KEY: "sk-test" });
    expect(result.kind).toBe("openai");
    expect(result.service).toBeDefined();
  });

  it("treats whitespace-only OPENAI_API_KEY as absent", () => {
    const result = createEmbeddingService({ OPENAI_API_KEY: "   " });
    expect(result.kind).toBe("stub");
  });
});
