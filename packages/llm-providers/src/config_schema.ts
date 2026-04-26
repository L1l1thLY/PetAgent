/**
 * YAML config schema + loader for PetAgent's multi-provider routing
 * (M2 G3 §3). Mirrors the Hermes cli-config.yaml shape:
 *
 *   providers:
 *     - id: my-kimi
 *       preset: kimi              # MUST reference a built-in preset
 *       api_key_env: KIMI_API_KEY # OR api_key: <literal>
 *       base_url: ...             # optional, overrides preset default
 *       model: ...                # optional, overrides preset default
 *
 *   llm_routing:
 *     psychologist: my-kimi       # value is a provider id from above
 *     reflector: my-kimi
 *     embedding: my-kimi
 *
 * Every provider id must be unique. Every preset must resolve. Every
 * routing target must reference a declared provider. Embedding routing
 * targets must reference a provider whose preset speaks
 * openai_embeddings (anthropic-only providers can't embed).
 *
 * The actual runtime construction (transport instantiation, env-var
 * resolution) lives in server/src/composition/llm-router.ts — this
 * package stays zero-dependency on Node's `process` global and
 * filesystem so it can be unit-tested standalone.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";
import yaml from "js-yaml";
import { resolvePreset } from "./registry.js";
import type { SubsystemKey } from "./types.js";

const ProviderEntrySchema = z
  .object({
    id: z.string().min(1, "provider id is required"),
    preset: z.string().min(1, "preset is required"),
    api_key_env: z.string().min(1).optional(),
    api_key: z.string().min(1).optional(),
    base_url: z.string().url().optional(),
    model: z.string().min(1).optional(),
  })
  .refine((v) => v.api_key_env !== undefined || v.api_key !== undefined, {
    message: "either api_key_env or api_key must be set",
    path: ["api_key_env"],
  });

const LLMRoutingSchema = z.object({
  psychologist: z.string().min(1).optional(),
  reflector: z.string().min(1).optional(),
  embedding: z.string().min(1).optional(),
});

const PetAgentConfigSchema = z.object({
  providers: z.array(ProviderEntrySchema).default([]),
  llm_routing: LLMRoutingSchema.default({}),
});

export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type LLMRouting = z.infer<typeof LLMRoutingSchema>;
export type PetAgentConfig = z.infer<typeof PetAgentConfigSchema>;

export interface ConfigValidationError {
  message: string;
  path?: string;
}

/**
 * Parses raw YAML/JSON text and runs both schema validation and
 * cross-field invariant checks. Throws an Error with a multi-line
 * message listing every issue.
 */
export function parseConfig(raw: string): PetAgentConfig {
  const obj: unknown = yaml.load(raw);
  const result = PetAgentConfigSchema.safeParse(obj ?? {});
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`,
    );
    throw new Error(
      "petagent.config.yaml validation failed:\n" + issues.join("\n"),
    );
  }
  validateInvariants(result.data);
  return result.data;
}

/**
 * Reads the config file from disk and validates it. Returns null if
 * the file does not exist (caller falls back to ENV-only BC mode).
 * Throws on any parse / validation failure — never silently empty.
 */
export function loadConfigFile(path: string): PetAgentConfig | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return parseConfig(text);
}

function validateInvariants(cfg: PetAgentConfig): void {
  const errors: string[] = [];

  // 1. Provider ids unique
  const seen = new Set<string>();
  for (const p of cfg.providers) {
    if (seen.has(p.id)) {
      errors.push(`duplicate provider id: ${p.id}`);
    }
    seen.add(p.id);
  }

  // 2. Every preset resolves
  for (const p of cfg.providers) {
    const preset = resolvePreset(p.preset);
    if (preset === null) {
      errors.push(
        `provider ${p.id}: unknown preset "${p.preset}". v1 ships: anthropic, openai, kimi, minimax, minimax-cn, deepseek, zai, gemini.`,
      );
    }
  }

  // 3. Routing targets reference declared providers
  const declaredIds = new Set(cfg.providers.map((p) => p.id));
  const routingEntries = Object.entries(cfg.llm_routing) as Array<
    [SubsystemKey, string | undefined]
  >;
  for (const [subsystem, providerId] of routingEntries) {
    if (providerId === undefined) continue;
    if (!declaredIds.has(providerId)) {
      errors.push(
        `llm_routing.${subsystem}: provider id "${providerId}" is not declared in providers[]`,
      );
    }
  }

  // 4. Embedding routing target's preset must support openai_embeddings
  const embeddingTarget = cfg.llm_routing.embedding;
  if (embeddingTarget !== undefined) {
    const provider = cfg.providers.find((p) => p.id === embeddingTarget);
    if (provider !== undefined) {
      const preset = resolvePreset(provider.preset);
      if (
        preset !== null &&
        !preset.wireProtocols.includes("openai_embeddings")
      ) {
        errors.push(
          `llm_routing.embedding: provider "${embeddingTarget}" uses preset "${provider.preset}" which does not speak openai_embeddings`,
        );
      }
    }
  }

  // 5. Psychologist / Reflector targets must speak a chat protocol
  for (const subsystem of ["psychologist", "reflector"] as const) {
    const target = cfg.llm_routing[subsystem];
    if (target === undefined) continue;
    const provider = cfg.providers.find((p) => p.id === target);
    if (provider === undefined) continue;
    const preset = resolvePreset(provider.preset);
    if (preset === null) continue;
    const speaksChat =
      preset.wireProtocols.includes("anthropic_messages") ||
      preset.wireProtocols.includes("openai_chat");
    if (!speaksChat) {
      errors.push(
        `llm_routing.${subsystem}: provider "${target}" uses preset "${provider.preset}" which does not speak any chat protocol`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      "petagent.config.yaml invariant violations:\n" +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }
}
