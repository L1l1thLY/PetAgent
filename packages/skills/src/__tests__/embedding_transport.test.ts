import { describe, it, expect, vi } from "vitest";
import { OpenAIEmbeddingTransport } from "../embedding_transport.js";

function fakeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAIEmbeddingTransport", () => {
  it("POSTs input + model to /v1/embeddings with bearer auth", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({
        data: [
          { embedding: [0.1, 0.2, 0.3] },
          { embedding: [0.4, 0.5, 0.6] },
        ],
      }),
    );
    const transport = new OpenAIEmbeddingTransport({
      apiKey: "sk-test",
      model: "text-embedding-3-small",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await transport.embed(["a", "b"]);
    expect(out).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    const call = (fetchImpl.mock.calls[0] as unknown[]);
    expect(call[0]).toBe("https://api.openai.com/v1/embeddings");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer sk-test");
    expect(headers["content-type"]).toBe("application/json");
    const payload = JSON.parse(init.body as string);
    expect(payload.model).toBe("text-embedding-3-small");
    expect(payload.input).toEqual(["a", "b"]);
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("nope", { status: 401, statusText: "Unauthorized", headers: {} }),
    );
    const transport = new OpenAIEmbeddingTransport({
      apiKey: "sk-bad",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(transport.embed(["x"])).rejects.toThrow(/HTTP 401/);
  });

  it("honors custom baseUrl + model", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ data: [{ embedding: [0.0] }] }),
    );
    const transport = new OpenAIEmbeddingTransport({
      apiKey: "sk-test",
      baseUrl: "https://gateway.example/openai/",
      model: "text-embedding-3-large",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.embed(["x"]);
    const call = (fetchImpl.mock.calls[0] as unknown[]);
    expect(call[0]).toBe("https://gateway.example/openai/v1/embeddings");
    const init = call[1] as RequestInit;
    const payload = JSON.parse(init.body as string);
    expect(payload.model).toBe("text-embedding-3-large");
  });

  it("constructor throws when fetch is unavailable and no fetchImpl is passed", () => {
    const orig = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = undefined;
    try {
      expect(
        () => new OpenAIEmbeddingTransport({ apiKey: "k" }),
      ).toThrow(/fetch/);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = orig;
    }
  });
});
