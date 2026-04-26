/**
 * Embedding transport port + OpenAI-compatible fetch-based implementation
 * (M2 Task 30a). Mirrors the AnthropicHttpClassifierTransport /
 * AnthropicHttpReflectionTransport pattern: no SDK dependency, all options
 * injectable for tests.
 *
 * Default model is `text-embedding-3-small` which natively returns
 * 1536-dim vectors — matching migration 0059's `vector(1536)` column on
 * `agent_notes`. Voyage AI (1024-dim) support would need either a
 * schema migration or zero-padding and is out of scope here.
 */

export interface EmbeddingTransport {
  embed(texts: string[]): Promise<number[][]>;
}

export interface OpenAIEmbeddingTransportOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenAIEmbeddingTransport implements EmbeddingTransport {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OpenAIEmbeddingTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = opts.model ?? DEFAULT_MODEL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "OpenAIEmbeddingTransport: no fetch implementation available. " +
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
          `OpenAIEmbeddingTransport: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        );
      }
      const body = (await res.json()) as OpenAIEmbeddingResponse;
      const data = Array.isArray(body.data) ? body.data : [];
      return data.map((d) => (Array.isArray(d.embedding) ? d.embedding : []));
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}
