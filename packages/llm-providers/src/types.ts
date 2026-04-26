/**
 * Core types for PetAgent's multi-provider LLM registry (M2 G3 §1).
 *
 * Hermes-style three-layer model:
 *   1. Wire-protocol transports (concrete fetch wrappers — one per protocol family)
 *   2. Provider preset registry (data-only, see registry.ts)
 *   3. YAML routing config (see config_schema.ts)
 *
 * The two transport ports — LLMTextTransport (chat) and EmbeddingTransport
 * — are the seams. PromptedClassifier / HaikuReflectionBuilder consume
 * LLMTextTransport; EmbeddingService consumes EmbeddingTransport.
 */

export type WireProtocol = "anthropic_messages" | "openai_chat" | "openai_embeddings";

export interface LLMTextTransport {
  send(args: {
    system: string;
    userMessage: string;
    maxTokens: number;
    model: string;
  }): Promise<string>;
}

export interface EmbeddingTransport {
  embed(texts: string[]): Promise<number[][]>;
}

export interface ProviderPreset {
  id: string;
  displayName: string;
  wireProtocols: WireProtocol[];
  defaultBaseUrl: Partial<Record<WireProtocol, string>>;
  defaultModels: Partial<Record<WireProtocol, string>>;
  apiKeyEnvVars: string[];
}

export type SubsystemKey = "psychologist" | "reflector" | "embedding";
