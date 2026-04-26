/**
 * @petagent/llm-providers — public surface.
 *
 * Three layers:
 *   - types: WireProtocol, LLMTextTransport, EmbeddingTransport, ProviderPreset, SubsystemKey
 *   - registry: BUILTIN_PRESETS + resolvePreset (data-only)
 *   - transports: AnthropicMessagesTransport, OpenAIChatCompletionsTransport, OpenAIEmbeddingsTransport
 *   - config: PetAgentConfig schema + loadConfig (YAML)
 */

export type {
  WireProtocol,
  LLMTextTransport,
  EmbeddingTransport,
  ProviderPreset,
  SubsystemKey,
} from "./types.js";

export {
  BUILTIN_PRESETS,
  ALIASES,
  resolvePreset,
  listPresetIds,
} from "./registry.js";
