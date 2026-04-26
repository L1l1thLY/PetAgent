/**
 * Embedding service for the M2 Notes layer.
 *
 * MVP ships a deterministic stub derived from SHA-256 of the input
 * text — same input always returns the same 1536-dim unit vector,
 * different inputs map to different vectors. Cosine similarity over
 * stub vectors is meaningful enough for unit tests and the M2 Group 1
 * integration test, but NOT for production retrieval.
 *
 * Real Anthropic / Voyage / OpenAI embedding API integration is
 * deferred to M2 Task 30a. Until then, callers that pass `useStub:
 * false` must also pass `apiKey`, and the private `callEmbedAPI`
 * method is intentionally a placeholder that throws.
 */

import { createHash } from "node:crypto";
import type { EmbeddingTransport } from "./embedding_transport.js";

const VECTOR_DIM = 1536;

export interface EmbeddingServiceOptions {
  apiKey?: string;
  model?: string;
  /** Force stub or real-API mode. When unset, uses stub iff apiKey is undefined. */
  useStub?: boolean;
  /** Required when useStub is false. Builds the actual API call. */
  transport?: EmbeddingTransport;
}

export class EmbeddingService {
  private readonly useStub: boolean;
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly transport: EmbeddingTransport | undefined;

  constructor(opts: EmbeddingServiceOptions = {}) {
    const useStub = opts.useStub ?? opts.apiKey === undefined;
    if (!useStub && !opts.apiKey) {
      throw new Error("EmbeddingService: apiKey is required when useStub is false.");
    }
    this.useStub = useStub;
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "text-embedding-3-small";
    this.transport = opts.transport;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.useStub) {
      return texts.map((t) => stubEmbed(t));
    }
    return this.callEmbedAPI(texts);
  }

  private async callEmbedAPI(texts: string[]): Promise<number[][]> {
    if (!this.transport) {
      throw new Error(
        "EmbeddingService: no transport configured for real API mode. " +
          "Pass `transport` in the constructor (e.g. new OpenAIEmbeddingTransport({ apiKey })).",
      );
    }
    void this.apiKey;
    void this.model;
    return this.transport.embed(texts);
  }
}

/**
 * Deterministic 1536-dim unit vector derived from SHA-256 of the input.
 * Each of the 1536 dimensions is filled by repeatedly hashing the seed
 * with a per-dimension counter, then unit-normalized.
 */
function stubEmbed(text: string): number[] {
  const seed = createHash("sha256").update(text).digest();
  const out = new Array<number>(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i++) {
    const round = createHash("sha256")
      .update(seed)
      .update(Buffer.from([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]))
      .digest();
    // Map the first 4 bytes to a signed int → float in (-1, 1).
    const u = round.readInt32BE(0);
    out[i] = u / 0x80000000;
  }
  // Unit-normalize.
  const mag = Math.sqrt(out.reduce((s, x) => s + x * x, 0));
  if (mag === 0) {
    out[0] = 1;
    return out;
  }
  for (let i = 0; i < VECTOR_DIM; i++) out[i] = out[i] / mag;
  return out;
}
