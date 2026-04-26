import { describe, it, expect, vi } from "vitest";
import {
  OpenAIChatCompletionsTransport,
  extractFirstChoiceContent,
} from "../openai_chat_transport.js";

function fakeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("extractFirstChoiceContent", () => {
  it("returns the first choice's message.content", () => {
    expect(
      extractFirstChoiceContent({
        choices: [
          { message: { role: "assistant", content: "hello" } },
          { message: { role: "assistant", content: "world" } },
        ],
      }),
    ).toBe("hello");
  });

  it("skips choices missing content and returns the first valid one", () => {
    expect(
      extractFirstChoiceContent({
        choices: [
          { message: { role: "assistant" } },
          { message: { role: "assistant", content: "found-it" } },
        ],
      }),
    ).toBe("found-it");
  });

  it("returns empty string when no choices have content", () => {
    expect(extractFirstChoiceContent({ choices: [] })).toBe("");
    expect(extractFirstChoiceContent({})).toBe("");
  });
});

describe("OpenAIChatCompletionsTransport", () => {
  it("POSTs to /v1/chat/completions with bearer auth and OpenAI-shaped body", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({
        choices: [
          { message: { role: "assistant", content: '{"distress_level":0.1}' } },
        ],
      }),
    );
    const transport = new OpenAIChatCompletionsTransport({
      apiKey: "sk-kimi-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await transport.send({
      system: "sys prompt",
      userMessage: "user body",
      maxTokens: 256,
      model: "moonshot-v1-32k",
    });
    expect(text).toBe('{"distress_level":0.1}');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer sk-kimi-test");
    expect(headers["content-type"]).toBe("application/json");

    const payload = JSON.parse(init.body as string);
    expect(payload).toEqual({
      model: "moonshot-v1-32k",
      max_tokens: 256,
      messages: [
        { role: "system", content: "sys prompt" },
        { role: "user", content: "user body" },
      ],
    });
  });

  it("drops empty system message from the messages array", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ choices: [{ message: { role: "assistant", content: "ok" } }] }),
    );
    const transport = new OpenAIChatCompletionsTransport({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.send({
      system: "   ",
      userMessage: "hi",
      maxTokens: 64,
      model: "m",
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("honors custom baseUrl and trims trailing slash (Kimi)", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ choices: [{ message: { content: "ok" } }] }),
    );
    const transport = new OpenAIChatCompletionsTransport({
      apiKey: "k",
      baseUrl: "https://api.moonshot.cn/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.send({ system: "s", userMessage: "u", maxTokens: 64, model: "m" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.moonshot.cn/v1/chat/completions");
  });

  it("honors custom baseUrl (Minimax)", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ choices: [{ message: { content: "ok" } }] }),
    );
    const transport = new OpenAIChatCompletionsTransport({
      apiKey: "k",
      baseUrl: "https://api.minimax.io",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.send({ system: "s", userMessage: "u", maxTokens: 64, model: "m" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.minimax.io/v1/chat/completions");
  });

  it("throws a descriptive error on non-2xx", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limited", {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "content-type": "text/plain" },
      }),
    );
    const transport = new OpenAIChatCompletionsTransport({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      transport.send({ system: "s", userMessage: "u", maxTokens: 64, model: "m" }),
    ).rejects.toThrow(/HTTP 429 Too Many Requests/);
  });

  it("returns empty string when response has no usable content", async () => {
    const fetchImpl = vi.fn(async () => fakeOk({ choices: [{}] }));
    const transport = new OpenAIChatCompletionsTransport({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await transport.send({
      system: "s",
      userMessage: "u",
      maxTokens: 64,
      model: "m",
    });
    expect(text).toBe("");
  });

  it("constructor throws if fetch unavailable and no fetchImpl passed", () => {
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = undefined;
    try {
      expect(
        () => new OpenAIChatCompletionsTransport({ apiKey: "k" }),
      ).toThrow(/fetch/);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
