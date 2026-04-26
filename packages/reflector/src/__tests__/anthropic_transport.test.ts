import { describe, it, expect, vi } from "vitest";
import { AnthropicHttpReflectionTransport, extractFirstText } from "../anthropic_transport.js";

function fakeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("extractFirstText", () => {
  it("returns the first text block", () => {
    expect(extractFirstText({ content: [{ type: "text", text: "hello" }] })).toBe("hello");
  });
  it("returns empty string when no text block", () => {
    expect(extractFirstText({ content: [] })).toBe("");
    expect(extractFirstText({})).toBe("");
  });
});

describe("AnthropicHttpReflectionTransport", () => {
  it("POSTs system + userMessage to /v1/messages with required headers", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ content: [{ type: "text", text: "reflective note" }] }),
    );
    const transport = new AnthropicHttpReflectionTransport({
      apiKey: "sk-ant-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await transport.send({
      system: "sys",
      userMessage: "user",
      maxTokens: 256,
      model: "claude-haiku-4-5-20251001",
    });
    expect(text).toBe("reflective note");
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const payload = JSON.parse(init.body as string);
    expect(payload.system).toBe("sys");
    expect(payload.messages[0].content).toBe("user");
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("bad", { status: 401, statusText: "Unauthorized", headers: {} }),
    );
    const transport = new AnthropicHttpReflectionTransport({
      apiKey: "x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      transport.send({ system: "s", userMessage: "u", maxTokens: 8, model: "m" }),
    ).rejects.toThrow(/HTTP 401/);
  });
});
