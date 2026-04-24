/**
 * HTTP-based `ClassifierTransport` for the Psychologist's
 * `PromptedClassifier` (Group 7). Uses fetch + the Anthropic Messages
 * API directly so we don't take on a new native SDK dependency at the
 * server package level.
 *
 * The psychologist package ships the abstract transport port plus the
 * PromptedClassifier that consumes it. This file wires a real API
 * call in. The CLASSIFIER_PROMPT itself (spec asset) lives inside
 * PromptedClassifier — we just transport system + userMessage +
 * model + maxTokens.
 */

import type { ClassifierTransport } from "@petagent/psychologist";

export interface AnthropicHttpClassifierTransportOptions {
  /** ANTHROPIC_API_KEY (fresh from secrets or env). */
  apiKey: string;
  /** Base URL override; defaults to the production Anthropic API. */
  baseUrl?: string;
  /** Explicit anthropic-version header; defaults to the most recent stable. */
  anthropicVersion?: string;
  /** Injected fetch implementation for tests. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout ms. Defaults to 30s. */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30_000;

export class AnthropicHttpClassifierTransport implements ClassifierTransport {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: AnthropicHttpClassifierTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.version = opts.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "AnthropicHttpClassifierTransport: no fetch implementation available. " +
          "Pass opts.fetchImpl or run on a Node version with global fetch.",
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
          `AnthropicHttpClassifierTransport: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        );
      }
      const body = (await res.json()) as AnthropicMessagesResponse;
      return extractFirstText(body);
    } finally {
      clearTimeout(timer);
    }
  }
}

interface AnthropicMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
}

export function extractFirstText(body: AnthropicMessagesResponse): string {
  const blocks = Array.isArray(body.content) ? body.content : [];
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return "";
}
