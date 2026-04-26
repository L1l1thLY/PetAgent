import { describe, it, expect, vi } from "vitest";
import {
  AnthropicMessagesTransport,
  extractFirstText,
} from "../anthropic_messages_transport.js";

function fakeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("extractFirstText", () => {
  it("returns the first text block", () => {
    expect(
      extractFirstText({
        content: [
          { type: "text", text: "hello" },
          { type: "text", text: "world" },
        ],
      }),
    ).toBe("hello");
  });

  it("skips non-text blocks", () => {
    expect(
      extractFirstText({
        content: [
          { type: "tool_use" } as { type: string },
          { type: "text", text: "finally" },
        ],
      }),
    ).toBe("finally");
  });

  it("returns empty string when no text block present", () => {
    expect(extractFirstText({ content: [] })).toBe("");
    expect(extractFirstText({})).toBe("");
  });
});

describe("AnthropicMessagesTransport", () => {
  it("POSTs to /v1/messages with x-api-key header and Anthropic-shaped body", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ content: [{ type: "text", text: "OK" }] }),
    );
    const transport = new AnthropicMessagesTransport({
      apiKey: "sk-ant-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await transport.send({
      system: "sys prompt",
      userMessage: "user body",
      maxTokens: 256,
      model: "claude-haiku-4-5-20251001",
    });
    expect(text).toBe("OK");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");

    const payload = JSON.parse(init.body as string);
    expect(payload).toEqual({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: "sys prompt",
      messages: [{ role: "user", content: "user body" }],
    });
  });

  it("throws a descriptive error on non-2xx responses", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("bad key", {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "text/plain" },
      }),
    );
    const transport = new AnthropicMessagesTransport({
      apiKey: "wrong",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      transport.send({
        system: "s",
        userMessage: "u",
        maxTokens: 128,
        model: "claude-haiku-4-5-20251001",
      }),
    ).rejects.toThrow(/HTTP 401 Unauthorized/);
  });

  it("honors custom baseUrl and trims trailing slash", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ content: [{ type: "text", text: "ok" }] }),
    );
    const transport = new AnthropicMessagesTransport({
      apiKey: "k",
      baseUrl: "https://gateway.example/ant/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.send({ system: "s", userMessage: "u", maxTokens: 64, model: "m" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://gateway.example/ant/v1/messages");
  });

  it("honors custom anthropicVersion header", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ content: [{ type: "text", text: "ok" }] }),
    );
    const transport = new AnthropicMessagesTransport({
      apiKey: "k",
      anthropicVersion: "2999-01-01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.send({ system: "s", userMessage: "u", maxTokens: 64, model: "m" });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2999-01-01");
  });

  it("constructor throws if fetch unavailable and no fetchImpl passed", () => {
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = undefined;
    try {
      expect(
        () => new AnthropicMessagesTransport({ apiKey: "k" }),
      ).toThrow(/fetch/);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
