import { describe, it, expect, vi } from "vitest";
import { OpenAIEmbeddingsTransport } from "../openai_embeddings_transport.js";

function fakeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAIEmbeddingsTransport", () => {
  it("POSTs input + model to /v1/embeddings with bearer auth", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({
        data: [
          { embedding: [0.1, 0.2, 0.3] },
          { embedding: [0.4, 0.5, 0.6] },
        ],
      }),
    );
    const transport = new OpenAIEmbeddingsTransport({
      apiKey: "sk-test",
      model: "text-embedding-3-small",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await transport.embed(["a", "b"]);
    expect(out).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer sk-test");
    expect(headers["content-type"]).toBe("application/json");
    const payload = JSON.parse(init.body as string);
    expect(payload).toEqual({
      model: "text-embedding-3-small",
      input: ["a", "b"],
    });
  });

  it("returns [] for empty input without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const transport = new OpenAIEmbeddingsTransport({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await transport.embed([]);
    expect(out).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses default model when not specified", async () => {
    const fetchImpl = vi.fn(async () => fakeOk({ data: [{ embedding: [1] }] }));
    const transport = new OpenAIEmbeddingsTransport({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.embed(["x"]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.model).toBe("text-embedding-3-small");
  });

  it("honors custom baseUrl + trims trailing slash", async () => {
    const fetchImpl = vi.fn(async () => fakeOk({ data: [{ embedding: [1] }] }));
    const transport = new OpenAIEmbeddingsTransport({
      apiKey: "k",
      baseUrl: "https://api.moonshot.cn/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.embed(["x"]);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.moonshot.cn/v1/embeddings");
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("nope", { status: 401, statusText: "Unauthorized", headers: {} }),
    );
    const transport = new OpenAIEmbeddingsTransport({
      apiKey: "sk-bad",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(transport.embed(["x"])).rejects.toThrow(/HTTP 401 Unauthorized/);
  });

  it("returns empty arrays for missing embedding fields", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ data: [{ embedding: [1, 2] }, {}, { embedding: "not-array" }] }),
    );
    const transport = new OpenAIEmbeddingsTransport({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await transport.embed(["a", "b", "c"]);
    expect(out).toEqual([[1, 2], [], []]);
  });

  it("constructor throws if fetch unavailable and no fetchImpl passed", () => {
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = undefined;
    try {
      expect(
        () => new OpenAIEmbeddingsTransport({ apiKey: "k" }),
      ).toThrow(/fetch/);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
