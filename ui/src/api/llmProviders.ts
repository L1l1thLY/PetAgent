import { api } from "./client";

export interface PresetMeta {
  id: string;
  displayName: string;
  wireProtocols: string[];
  defaultBaseUrl: Record<string, string | undefined>;
  defaultModels: Record<string, string | undefined>;
  embeddingDims: number | null;
  apiKeyEnvVars: string[];
  supportsChat: boolean;
  supportsEmbedding: boolean;
}

export interface ProviderEntry {
  id: string;
  preset: string;
  presetDisplayName: string;
  model: string | null;
  baseUrl: string | null;
  apiKeyEnv: string | null;
  hasKey: boolean;
}

export interface LlmProvidersConfig {
  presets: PresetMeta[];
  providers: ProviderEntry[];
  routing: {
    psychologist?: string;
    reflector?: string;
    embedding?: string;
  };
  configSource: "config" | "env-fallback";
  configPath: string;
  envPath: string;
  hasAnyConfiguredProvider: boolean;
  hasAnyResolvedKey: boolean;
}

export interface ProviderUpdateInput {
  id: string;
  preset: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
}

export interface UpdateLlmProvidersPayload {
  providers: ProviderUpdateInput[];
  routing: {
    psychologist?: string;
    reflector?: string;
    embedding?: string;
  };
}

export interface UpdateLlmProvidersResult {
  ok: true;
  configPath: string;
  envPath: string;
  wroteEnvKeys: string[];
  restartRequired: true;
}

export const llmProvidersApi = {
  get: () => api.get<LlmProvidersConfig>("/instance/settings/llm-providers"),
  update: (payload: UpdateLlmProvidersPayload) =>
    api.post<UpdateLlmProvidersResult>("/instance/settings/llm-providers", payload),
};
