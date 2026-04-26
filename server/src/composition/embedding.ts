/**
 * Composition factory for the EmbeddingService (M2 G3 §4 — refactored).
 *
 * Now driven by the LLMRouter rather than reading env vars directly.
 * The router resolves the configured embedding provider (or falls back
 * to the OPENAI_API_KEY env-fallback path) and hands back a transport
 * we wrap in EmbeddingService.
 *
 * Returned `kind` echoes the resolved preset (e.g. "openai", "kimi",
 * "minimax") for the [petagent] startup log line. "stub" means no
 * embedding provider was resolved — EmbeddingService runs in
 * SHA-256 stub mode and notes search degrades to keyword match.
 */

import { EmbeddingService } from "@petagent/skills";
import type { LLMRouter } from "./llm-router.js";

export type EmbeddingServiceKind = "stub" | string;

export interface CreateEmbeddingServiceResult {
  service: EmbeddingService;
  kind: EmbeddingServiceKind;
  model: string | null;
}

export function createEmbeddingService(deps: {
  router: LLMRouter;
}): CreateEmbeddingServiceResult {
  const route = deps.router.getEmbeddingTransport();
  if (route === null) {
    return { service: new EmbeddingService(), kind: "stub", model: null };
  }
  const desc = deps.router.describeRouting().find((d) => d.subsystem === "embedding");
  return {
    service: new EmbeddingService({
      // EmbeddingService.useStub gates on apiKey being defined; supply a
      // marker to keep its constructor happy (the actual key is already
      // baked into the transport).
      apiKey: "router-managed",
      useStub: false,
      transport: route.transport,
      model: route.model,
    }),
    kind: desc?.preset ?? "openai",
    model: route.model,
  };
}
