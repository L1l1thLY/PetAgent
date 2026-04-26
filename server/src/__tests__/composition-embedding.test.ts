import { describe, it, expect } from "vitest";
import { createEmbeddingService } from "../composition/embedding.js";
import type { LLMRouter } from "../composition/llm-router.js";
import type { EmbeddingTransport } from "@petagent/llm-providers";

const fakeEmbeddingTransport: EmbeddingTransport = {
  async embed(texts) {
    return texts.map(() => Array(1536).fill(0.5));
  },
};

function fakeRouter(opts: {
  embeddingTransport?: { transport: EmbeddingTransport; model: string };
  preset?: string;
} = {}): LLMRouter {
  return {
    getTextTransport: () => null,
    getEmbeddingTransport: () => opts.embeddingTransport ?? null,
    describeRouting: () =>
      opts.embeddingTransport && opts.preset
        ? [
            {
              subsystem: "embedding",
              providerId: "test-provider",
              preset: opts.preset,
              wireProtocol: "openai_embeddings",
              model: opts.embeddingTransport.model,
              source: "config",
            },
          ]
        : [],
  };
}

describe("createEmbeddingService", () => {
  it("returns stub-mode service when router returns no embedding transport", async () => {
    const result = createEmbeddingService({ router: fakeRouter() });
    expect(result.kind).toBe("stub");
    expect(result.model).toBeNull();
    const vec = await result.service.embed("hello");
    expect(vec).toHaveLength(1536);
  });

  it("returns live service when router supplies a transport", () => {
    const result = createEmbeddingService({
      router: fakeRouter({
        embeddingTransport: { transport: fakeEmbeddingTransport, model: "text-embedding-3-small" },
        preset: "openai",
      }),
    });
    expect(result.kind).toBe("openai");
    expect(result.model).toBe("text-embedding-3-small");
    expect(result.service).toBeDefined();
  });

  it("kind echoes the resolved preset (e.g. kimi)", () => {
    const result = createEmbeddingService({
      router: fakeRouter({
        embeddingTransport: { transport: fakeEmbeddingTransport, model: "moonshot-v1-embedding" },
        preset: "kimi",
      }),
    });
    expect(result.kind).toBe("kimi");
  });
});
