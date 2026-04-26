/**
 * fetch-based Anthropic Messages transport for the reflector. Mirrors
 * server/src/psychologist/anthropic_classifier_transport.ts so the
 * reflector package can ship without taking on @anthropic-ai/sdk.
 */

export interface AnthropicHttpReflectionTransportOptions {
  apiKey: string;
  baseUrl?: string;
  anthropicVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30_000;

export class AnthropicHttpReflectionTransport {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: AnthropicHttpReflectionTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.version = opts.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "AnthropicHttpReflectionTransport: no fetch implementation available. " +
          "Pass opts.fetchImpl or run on Node 18+.",
      );
    }
  }

  async send(args: {
    system: string;
    userMessage: string;
    maxTokens: number;
    model: string;
  }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": this.version,
        },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxTokens,
          system: args.system,
          messages: [{ role: "user", content: args.userMessage }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `AnthropicHttpReflectionTransport: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        );
      }
      const body = (await res.json()) as AnthropicMessagesResponse;
      return extractFirstText(body);
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface AnthropicMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
}

export function extractFirstText(body: AnthropicMessagesResponse): string {
  const blocks = Array.isArray(body.content) ? body.content : [];
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") return block.text;
  }
  return "";
}
