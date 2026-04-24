import { describe, it, expect, vi } from "vitest";
import {
  AnthropicHttpClassifierTransport,
  extractFirstText,
} from "../psychologist/anthropic_classifier_transport.js";

function fakeOkResponse(body: unknown): Response {
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

describe("AnthropicHttpClassifierTransport", () => {
  it("POSTs system + userMessage to /v1/messages with the right headers", async () => {
    const fetchImpl = vi.fn(
      async () =>
        fakeOkResponse({
          content: [{ type: "text", text: '{"distress_level":0.1,"signals":[],"recommended_intervention":"none"}' }],
        }),
    );
    const transport = new AnthropicHttpClassifierTransport({
      apiKey: "sk-ant-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await transport.send({
      system: "sys prompt",
      userMessage: "user body",
      maxTokens: 256,
      model: "claude-haiku-4-5-20251001",
    });
    expect(text).toMatch(/distress_level/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    const init = call[1] as RequestInit;
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.system).toBe("sys prompt");
    expect(payload.messages[0].content).toBe("user body");
    expect(payload.model).toBe("claude-haiku-4-5-20251001");
    expect(payload.max_tokens).toBe(256);
  });

  it("throws a descriptive error on non-2xx responses", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("bad key", {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "text/plain" },
        }),
    );
    const transport = new AnthropicHttpClassifierTransport({
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

  it("honors custom baseUrl + anthropic-version header", async () => {
    const fetchImpl = vi.fn(
      async () => fakeOkResponse({ content: [{ type: "text", text: "ok" }] }),
    );
    const transport = new AnthropicHttpClassifierTransport({
      apiKey: "k",
      baseUrl: "https://gateway.example/ant/",
      anthropicVersion: "2999-01-01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.send({
      system: "s",
      userMessage: "u",
      maxTokens: 64,
      model: "m",
    });
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe("https://gateway.example/ant/v1/messages");
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2999-01-01");
  });

  it("constructor throws if fetch is unavailable and no fetchImpl is passed", () => {
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = undefined;
    try {
      expect(
        () => new AnthropicHttpClassifierTransport({ apiKey: "k" }),
      ).toThrow(/fetch/);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
