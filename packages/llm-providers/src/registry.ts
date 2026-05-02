/**
 * Built-in provider preset registry (M2 G3 §2).
 *
 * v1 ships 8 hardcoded presets covering Anthropic + OpenAI + 6 China-friendly
 * OpenAI-compatible providers. Custom providers without a preset (free-form
 * wire_protocol/base_url for local LM Studio etc) are deferred to M3.
 *
 * Default models reflect each vendor's general-purpose tier as of 2026-04;
 * users override per-provider via `model:` in petagent.config.yaml.
 *
 * Embedding dimensions: all v1 presets that expose openai_embeddings return
 * 1536-dim vectors (matches pgvector schema). Future Voyage/Cohere providers
 * with different dims will need either schema migration or zero-padding.
 */

import type { ProviderPreset } from "./types.js";

export const BUILTIN_PRESETS: readonly ProviderPreset[] = [
  {
    id: "anthropic",
    displayName: "Anthropic (Claude)",
    wireProtocols: ["anthropic_messages"],
    defaultBaseUrl: { anthropic_messages: "https://api.anthropic.com" },
    defaultModels: { anthropic_messages: "claude-haiku-4-5-20251001" },
    apiKeyEnvVars: ["ANTHROPIC_API_KEY"],
  },
  {
    id: "openai",
    displayName: "OpenAI",
    wireProtocols: ["openai_chat", "openai_embeddings"],
    defaultBaseUrl: {
      openai_chat: "https://api.openai.com",
      openai_embeddings: "https://api.openai.com",
    },
    defaultModels: {
      openai_chat: "gpt-4o-mini",
      openai_embeddings: "text-embedding-3-small",
    },
    apiKeyEnvVars: ["OPENAI_API_KEY"],
  },
  {
    id: "kimi",
    displayName: "Kimi (Moonshot AI)",
    wireProtocols: ["openai_chat", "openai_embeddings"],
    defaultBaseUrl: {
      openai_chat: "https://api.moonshot.cn",
      openai_embeddings: "https://api.moonshot.cn",
    },
    defaultModels: {
      openai_chat: "moonshot-v1-32k",
      openai_embeddings: "moonshot-v1-embedding",
    },
    apiKeyEnvVars: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
  },
  {
    id: "kimi-coding",
    displayName: "Kimi K2 (Coding / Claude-compatible)",
    wireProtocols: ["anthropic_messages", "openai_embeddings"],
    defaultBaseUrl: {
      anthropic_messages: "https://api.kimi.com/coding",
      openai_embeddings: "https://api.kimi.com/coding",
    },
    defaultModels: {
      anthropic_messages: "kimi-k2.6",
      openai_embeddings: "kimi-k2.6",
    },
    apiKeyEnvVars: ["KIMI_CODING_KEY"],
  },
  {
    id: "minimax",
    displayName: "MiniMax (Global)",
    wireProtocols: ["openai_chat", "openai_embeddings"],
    defaultBaseUrl: {
      openai_chat: "https://api.minimax.io",
      openai_embeddings: "https://api.minimax.io",
    },
    defaultModels: {
      openai_chat: "abab6.5s-chat",
      openai_embeddings: "embo-01",
    },
    apiKeyEnvVars: ["MINIMAX_API_KEY"],
  },
  {
    id: "minimax-cn",
    displayName: "MiniMax (China)",
    wireProtocols: ["openai_chat", "openai_embeddings"],
    defaultBaseUrl: {
      openai_chat: "https://api.minimax.chat",
      openai_embeddings: "https://api.minimax.chat",
    },
    defaultModels: {
      openai_chat: "abab6.5s-chat",
      openai_embeddings: "embo-01",
    },
    apiKeyEnvVars: ["MINIMAX_CN_API_KEY", "MINIMAX_API_KEY"],
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    wireProtocols: ["openai_chat"],
    defaultBaseUrl: { openai_chat: "https://api.deepseek.com" },
    defaultModels: { openai_chat: "deepseek-chat" },
    apiKeyEnvVars: ["DEEPSEEK_API_KEY"],
  },
  {
    id: "zai",
    displayName: "Zhipu AI (GLM)",
    wireProtocols: ["openai_chat", "openai_embeddings"],
    defaultBaseUrl: {
      openai_chat: "https://open.bigmodel.cn/api/paas/v4",
      openai_embeddings: "https://open.bigmodel.cn/api/paas/v4",
    },
    defaultModels: {
      openai_chat: "glm-4-flash",
      openai_embeddings: "embedding-3",
    },
    apiKeyEnvVars: ["GLM_API_KEY", "ZHIPU_API_KEY"],
  },
  {
    id: "gemini",
    displayName: "Google Gemini (OpenAI-compatible mode)",
    wireProtocols: ["openai_chat", "openai_embeddings"],
    defaultBaseUrl: {
      openai_chat: "https://generativelanguage.googleapis.com/v1beta/openai",
      openai_embeddings: "https://generativelanguage.googleapis.com/v1beta/openai",
    },
    defaultModels: {
      openai_chat: "gemini-2.0-flash",
      openai_embeddings: "text-embedding-004",
    },
    apiKeyEnvVars: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  },
];

export const ALIASES: Readonly<Record<string, string>> = {
  claude: "anthropic",
  moonshot: "kimi",
  "kimi-for-coding": "kimi-coding",
  "kimi-k2": "kimi-coding",
  glm: "zai",
  zhipu: "zai",
  google: "gemini",
};

export function resolvePreset(id: string): ProviderPreset | null {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return null;
  const canonical = ALIASES[normalized] ?? normalized;
  return BUILTIN_PRESETS.find((p) => p.id === canonical) ?? null;
}

export function listPresetIds(): string[] {
  return BUILTIN_PRESETS.map((p) => p.id);
}
