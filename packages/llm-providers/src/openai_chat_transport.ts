/**
 * fetch-based transport for OpenAI Chat Completions
 * (`POST /v1/chat/completions`). The `openai_chat` wire protocol is
 * spoken by every OpenAI-compatible LLM endpoint v1 cares about:
 *   - openai (api.openai.com)
 *   - kimi / moonshot (api.moonshot.cn)
 *   - minimax / minimax-cn (api.minimax.io / api.minimax.chat)
 *   - deepseek (api.deepseek.com)
 *   - zai / zhipu (open.bigmodel.cn)
 *   - gemini OpenAI-compat mode (generativelanguage.googleapis.com/v1beta/openai)
 *
 * Maps the LLMTextTransport.send shape (`{system, userMessage, maxTokens, model}`)
 * to the OpenAI request body:
 *   { model, max_tokens, messages: [
 *       {role:"system", content: system},
 *       {role:"user",   content: userMessage}
 *   ] }
 *
 * Returns the first choice's message.content string (the standard
 * non-streaming response shape across all v1 providers).
 *
 * Empty system prompts are dropped from the messages array — many
 * OpenAI-compat providers reject empty system messages with 400.
 *
 * v1 hard-codes `max_tokens` (legacy OpenAI name). The OpenAI o1 family
 * uses `max_completion_tokens` instead, but PetAgent's Psychologist /
 * Reflector use Haiku-tier models that all accept `max_tokens`.
 * Migration to the newer field is deferred.
 */

import type { LLMTextTransport } from "./types.js";

export interface OpenAIChatCompletionsTransportOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenAIChatCompletionsTransport implements LLMTextTransport {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OpenAIChatCompletionsTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "OpenAIChatCompletionsTransport: no fetch implementation available. " +
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
    const messages: OpenAIChatMessage[] = [];
    if (args.system.trim().length > 0) {
      messages.push({ role: "system", content: args.system });
    }
    messages.push({ role: "user", content: args.userMessage });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxTokens,
          messages,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `OpenAIChatCompletionsTransport: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        );
      }
      const body = (await res.json()) as OpenAIChatCompletionsResponse;
      return extractFirstChoiceContent(body);
    } finally {
      clearTimeout(timer);
    }
  }
}

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIChatCompletionsResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
  }>;
}

export function extractFirstChoiceContent(body: OpenAIChatCompletionsResponse): string {
  const choices = Array.isArray(body.choices) ? body.choices : [];
  for (const choice of choices) {
    const content = choice.message?.content;
    if (typeof content === "string") return content;
  }
  return "";
}
