/**
 * Composition factory for the EmbeddingService (M2 Task 30a).
 *
 * Reads OPENAI_API_KEY (and optional OPENAI_EMBEDDING_MODEL) from the
 * provided environment object and returns either a real-API service
 * backed by OpenAIEmbeddingTransport, or a stub-mode service for
 * environments without a key. Centralizing the decision here keeps
 * the Reflector composition and the agent-notes search route in lock
 * step — both call createEmbeddingService and never construct
 * EmbeddingService directly.
 */

import { EmbeddingService, OpenAIEmbeddingTransport } from "@petagent/skills";

export type EmbeddingServiceKind = "stub" | "openai";

export interface CreateEmbeddingServiceResult {
  service: EmbeddingService;
  kind: EmbeddingServiceKind;
}

export function createEmbeddingService(
  env: Pick<NodeJS.ProcessEnv, "OPENAI_API_KEY" | "OPENAI_EMBEDDING_MODEL">,
): CreateEmbeddingServiceResult {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey.length === 0) {
    return { service: new EmbeddingService(), kind: "stub" };
  }
  const model = env.OPENAI_EMBEDDING_MODEL?.trim() || undefined;
  const transport = new OpenAIEmbeddingTransport({ apiKey, model });
  return {
    service: new EmbeddingService({ apiKey, useStub: false, transport, model }),
    kind: "openai",
  };
}
