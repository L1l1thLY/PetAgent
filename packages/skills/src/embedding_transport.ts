/**
 * Backwards-compat re-export shim. The actual transport now lives in
 * @petagent/llm-providers (M2 G3 §1) — this file preserves the legacy
 * import paths used by EmbeddingService callers and existing tests:
 *
 *   import { OpenAIEmbeddingTransport, type EmbeddingTransport }
 *     from "@petagent/skills/embedding_transport";  (or relative)
 */

export type { EmbeddingTransport } from "@petagent/llm-providers";
export {
  OpenAIEmbeddingsTransport as OpenAIEmbeddingTransport,
} from "@petagent/llm-providers";
export type {
  OpenAIEmbeddingsTransportOptions as OpenAIEmbeddingTransportOptions,
  OpenAIEmbeddingsResponse as OpenAIEmbeddingResponse,
} from "@petagent/llm-providers";
