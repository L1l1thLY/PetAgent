/**
 * Re-exports for the `./transports` subpath. Convenience aggregation —
 * direct deep imports (e.g. `from "@petagent/llm-providers/transports"`)
 * keep tree-shaking honest for callers that only need one transport.
 */

export {
  AnthropicMessagesTransport,
  extractFirstText as extractFirstAnthropicText,
} from "./anthropic_messages_transport.js";
export type {
  AnthropicMessagesTransportOptions,
  AnthropicMessagesResponse,
} from "./anthropic_messages_transport.js";

export { OpenAIEmbeddingsTransport } from "./openai_embeddings_transport.js";
export type {
  OpenAIEmbeddingsTransportOptions,
  OpenAIEmbeddingsResponse,
} from "./openai_embeddings_transport.js";
