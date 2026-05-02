/**
 * fetch-based transport for OpenAI-compatible embeddings APIs
 * (`POST /v1/embeddings`). Used by the `openai`, `kimi`, `minimax`,
 * `zai`, `gemini` presets — any provider whose embeddings endpoint
 * speaks the OpenAI shape `{model, input}` → `{data:[{embedding}]}`.
 *
 * Replaces packages/skills/src/embedding_transport.ts's
 * `OpenAIEmbeddingTransport`, which now re-exports this class for BC.
 *
 * The transport does not enforce vector dimensions. Provider/model
 * dimensions are tracked as registry metadata so server startup can warn
 * when the configured provider does not match the pgvector column.
 */

import type { EmbeddingTransport } from "./types.js";

export interface OpenAIEmbeddingsTransportOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenAIEmbeddingsTransport implements EmbeddingTransport {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OpenAIEmbeddingsTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = opts.model ?? DEFAULT_MODEL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "OpenAIEmbeddingsTransport: no fetch implementation available. " +
          "Pass opts.fetchImpl or run on Node 18+.",
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `OpenAIEmbeddingsTransport: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        );
      }
      const body = (await res.json()) as OpenAIEmbeddingsResponse;
      const data = Array.isArray(body.data) ? body.data : [];
      return data.map((d) => (Array.isArray(d.embedding) ? d.embedding : []));
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface OpenAIEmbeddingsResponse {
  data?: Array<{ embedding?: number[] }>;
}
