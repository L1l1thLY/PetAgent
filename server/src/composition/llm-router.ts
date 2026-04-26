/**
 * LLMRouter — runtime glue between petagent.config.yaml and the
 * concrete transport classes (M2 G3 §4).
 *
 * Reads YAML at startup, resolves preset defaults, picks API keys
 * from env, and lazily instantiates the correct transport per
 * subsystem. Compositions (psychologist / reflector / embedding) ask
 * the router for a transport; the router returns null when no provider
 * is configured for that subsystem (caller falls back to passthrough /
 * templated / stub).
 *
 * Backwards compat: when no petagent.config.yaml exists, synthesises a
 * minimal config from ANTHROPIC_API_KEY (→ anthropic preset for
 * psychologist + reflector) and OPENAI_API_KEY (→ openai preset for
 * embedding). This preserves v0.4.0-pre-m2 behavior for users who
 * haven't written a config file.
 */

import path from "node:path";
import {
  loadConfigFile,
  resolvePreset,
  AnthropicMessagesTransport,
  OpenAIChatCompletionsTransport,
  OpenAIEmbeddingsTransport,
  type EmbeddingTransport,
  type LLMTextTransport,
  type PetAgentConfig,
  type ProviderEntry,
  type ProviderPreset,
  type SubsystemKey,
  type WireProtocol,
} from "@petagent/llm-providers";

export interface LLMRouter {
  getTextTransport(
    subsystem: "psychologist" | "reflector",
  ): { transport: LLMTextTransport; model: string } | null;
  getEmbeddingTransport(): { transport: EmbeddingTransport; model: string } | null;
  describeRouting(): RoutingDescription[];
}

export interface RoutingDescription {
  subsystem: SubsystemKey;
  providerId: string;
  preset: string;
  wireProtocol: WireProtocol;
  model: string;
  source: "config" | "env-fallback";
}

export interface CreateLLMRouterDeps {
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** Override config path. Default: $PETAGENT_CONFIG or ./petagent.config.yaml in CWD. */
  configPath?: string;
  /** Logger for warnings (e.g. resolved-key-missing-but-config-exists cases). */
  logger?: { warn(msg: string, meta?: unknown): void };
}

const DEFAULT_CONFIG_FILENAME = "petagent.config.yaml";

export function createLLMRouter(deps: CreateLLMRouterDeps): LLMRouter {
  const env = deps.env;
  const cfg = loadConfig(env, deps.configPath);
  const source: "config" | "env-fallback" = cfg.source;
  const config = cfg.config;
  const logger = deps.logger;

  const indexedProviders = new Map<string, ProviderEntry>();
  for (const p of config.providers) indexedProviders.set(p.id, p);

  function resolveApiKey(entry: ProviderEntry, preset: ProviderPreset): string | null {
    if (entry.api_key_env !== undefined) {
      const v = env[entry.api_key_env];
      if (v !== undefined && v.trim().length > 0) return v.trim();
    }
    if (entry.api_key !== undefined && entry.api_key.trim().length > 0) {
      return entry.api_key.trim();
    }
    // Fall back to preset's declared env vars (first non-empty wins).
    for (const name of preset.apiKeyEnvVars) {
      const v = env[name];
      if (v !== undefined && v.trim().length > 0) return v.trim();
    }
    return null;
  }

  interface ResolvedTextRoute {
    entry: ProviderEntry;
    preset: ProviderPreset;
    wireProtocol: WireProtocol;
    apiKey: string;
    model: string;
    baseUrl: string;
  }

  function resolveTextRoute(subsystem: "psychologist" | "reflector"): ResolvedTextRoute | null {
    const targetId = config.llm_routing[subsystem];
    if (targetId === undefined) return null;
    const entry = indexedProviders.get(targetId);
    if (entry === undefined) return null;
    const preset = resolvePreset(entry.preset);
    if (preset === null) return null;

    const wireProtocol: WireProtocol = preset.wireProtocols.includes("anthropic_messages")
      ? "anthropic_messages"
      : "openai_chat";
    if (!preset.wireProtocols.includes(wireProtocol)) return null;

    const apiKey = resolveApiKey(entry, preset);
    if (apiKey === null) {
      logger?.warn(
        `[llm-router] ${subsystem} → ${entry.id}: api key not found (env vars: ${[
          entry.api_key_env,
          ...preset.apiKeyEnvVars,
        ]
          .filter(Boolean)
          .join(", ")})`,
      );
      return null;
    }

    const model = entry.model ?? preset.defaultModels[wireProtocol] ?? "";
    const baseUrl = entry.base_url ?? preset.defaultBaseUrl[wireProtocol] ?? "";
    if (model === "" || baseUrl === "") return null;

    return { entry, preset, wireProtocol, apiKey, model, baseUrl };
  }

  interface ResolvedEmbeddingRoute {
    entry: ProviderEntry;
    preset: ProviderPreset;
    apiKey: string;
    model: string;
    baseUrl: string;
  }

  function resolveEmbeddingRoute(): ResolvedEmbeddingRoute | null {
    const targetId = config.llm_routing.embedding;
    if (targetId === undefined) return null;
    const entry = indexedProviders.get(targetId);
    if (entry === undefined) return null;
    const preset = resolvePreset(entry.preset);
    if (preset === null) return null;
    if (!preset.wireProtocols.includes("openai_embeddings")) return null;

    const apiKey = resolveApiKey(entry, preset);
    if (apiKey === null) {
      logger?.warn(
        `[llm-router] embedding → ${entry.id}: api key not found (env vars: ${[
          entry.api_key_env,
          ...preset.apiKeyEnvVars,
        ]
          .filter(Boolean)
          .join(", ")})`,
      );
      return null;
    }

    const model = entry.model ?? preset.defaultModels.openai_embeddings ?? "";
    const baseUrl = entry.base_url ?? preset.defaultBaseUrl.openai_embeddings ?? "";
    if (model === "" || baseUrl === "") return null;

    return { entry, preset, apiKey, model, baseUrl };
  }

  return {
    getTextTransport(subsystem) {
      const route = resolveTextRoute(subsystem);
      if (route === null) return null;
      const transport: LLMTextTransport =
        route.wireProtocol === "anthropic_messages"
          ? new AnthropicMessagesTransport({ apiKey: route.apiKey, baseUrl: route.baseUrl })
          : new OpenAIChatCompletionsTransport({ apiKey: route.apiKey, baseUrl: route.baseUrl });
      return { transport, model: route.model };
    },
    getEmbeddingTransport() {
      const route = resolveEmbeddingRoute();
      if (route === null) return null;
      const transport = new OpenAIEmbeddingsTransport({
        apiKey: route.apiKey,
        baseUrl: route.baseUrl,
        model: route.model,
      });
      return { transport, model: route.model };
    },
    describeRouting() {
      const out: RoutingDescription[] = [];
      for (const subsystem of ["psychologist", "reflector"] as const) {
        const route = resolveTextRoute(subsystem);
        if (route === null) continue;
        out.push({
          subsystem,
          providerId: route.entry.id,
          preset: route.preset.id,
          wireProtocol: route.wireProtocol,
          model: route.model,
          source,
        });
      }
      const embed = resolveEmbeddingRoute();
      if (embed !== null) {
        out.push({
          subsystem: "embedding",
          providerId: embed.entry.id,
          preset: embed.preset.id,
          wireProtocol: "openai_embeddings",
          model: embed.model,
          source,
        });
      }
      return out;
    },
  };
}

interface LoadedConfig {
  config: PetAgentConfig;
  source: "config" | "env-fallback";
}

function loadConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  configPathOverride?: string,
): LoadedConfig {
  const configPath =
    configPathOverride ?? env.PETAGENT_CONFIG ?? path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME);
  const fromFile = loadConfigFile(configPath);
  if (fromFile !== null) {
    return { config: fromFile, source: "config" };
  }
  return { config: synthesizeFallbackConfig(env), source: "env-fallback" };
}

/**
 * BC fallback when no petagent.config.yaml exists:
 *   - ANTHROPIC_API_KEY → anthropic preset for psychologist + reflector
 *   - OPENAI_API_KEY    → openai preset for embedding
 *
 * If neither is set, returns an empty config (router will report null
 * everywhere, caller's existing passthrough/templated/stub fallback
 * activates as it did pre-M2-G3).
 */
function synthesizeFallbackConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): PetAgentConfig {
  const providers: PetAgentConfig["providers"] = [];
  const llm_routing: PetAgentConfig["llm_routing"] = {};

  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey && anthropicKey.length > 0) {
    providers.push({
      id: "_bc_anthropic",
      preset: "anthropic",
      api_key_env: "ANTHROPIC_API_KEY",
    });
    llm_routing.psychologist = "_bc_anthropic";
    llm_routing.reflector = "_bc_anthropic";
  }

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey && openaiKey.length > 0) {
    providers.push({
      id: "_bc_openai",
      preset: "openai",
      api_key_env: "OPENAI_API_KEY",
      ...(env.OPENAI_EMBEDDING_MODEL?.trim()
        ? { model: env.OPENAI_EMBEDDING_MODEL.trim() }
        : {}),
    });
    llm_routing.embedding = "_bc_openai";
  }

  return { providers, llm_routing };
}
