/**
 * LLM Providers settings routes — UI surface for the M2 G3 multi-provider
 * registry (v0.5.1+).
 *
 * Lets the React Settings page read + write `petagent.config.yaml` and
 * `~/.petagent/<instance>/.env` without requiring the user to hand-edit
 * either file.
 *
 *   GET  /instance/settings/llm-providers
 *     Returns: { presets, providers, routing, configSource, configPath,
 *                envPath, hasAnyKey }
 *     Permission: any authenticated board user (read-only — keys are
 *     never returned, only `hasKey: boolean`).
 *
 *   POST /instance/settings/llm-providers
 *     Body: { providers: [{id, preset, model?, baseUrl?, apiKey?,
 *             apiKeyEnv?}], routing: {psychologist?, reflector?,
 *             embedding?} }
 *     Side effects: writes env file (only keys user provided), writes
 *     yaml config. Restart required to take effect.
 *     Permission: instance admin.
 */

import { Router, type Request } from "express";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { z } from "zod";
import yaml from "js-yaml";
import {
  BUILTIN_PRESETS,
  parseConfig,
  resolvePreset,
  type PetAgentConfig,
  type ProviderEntry,
} from "@petagent/llm-providers";
import { resolvePetAgentEnvPath } from "../paths.js";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { assertBoardOrgAccess } from "./authz.js";

const DEFAULT_CONFIG_FILENAME = "petagent.config.yaml";

function assertCanManageLLMProviders(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
    return;
  }
  throw forbidden("Instance admin access required");
}

function resolveConfigPath(): string {
  return process.env.PETAGENT_LLM_CONFIG ?? path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME);
}

function readExistingConfig(): { config: PetAgentConfig; source: "config" | "env-fallback" } {
  const configPath = resolveConfigPath();
  if (!existsSync(configPath)) {
    return { config: { providers: [], llm_routing: {} }, source: "env-fallback" };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    return { config: parseConfig(raw), source: "config" };
  } catch {
    return { config: { providers: [], llm_routing: {} }, source: "env-fallback" };
  }
}

interface DotEnv {
  /** Key → value preserving order via the lines array */
  values: Map<string, string>;
  /** Full original lines for round-trip preservation */
  lines: string[];
}

function readEnvFile(envPath: string): DotEnv {
  if (!existsSync(envPath)) return { values: new Map(), lines: [] };
  const raw = readFileSync(envPath, "utf-8");
  const lines = raw.split(/\r?\n/);
  const values = new Map<string, string>();
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1);
    const stripped = stripDotenvQuotes(value);
    values.set(key, stripped);
  }
  return { values, lines };
}

function stripDotenvQuotes(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function writeEnvFile(envPath: string, dotenv: DotEnv, updates: Map<string, string>): void {
  const seen = new Set<string>();
  const newLines: string[] = [];

  for (const line of dotenv.lines) {
    const trimmed = line.trimStart();
    if (trimmed === "" || trimmed.startsWith("#")) {
      newLines.push(line);
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) {
      newLines.push(line);
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    if (updates.has(key)) {
      newLines.push(`${key}=${quoteIfNeeded(updates.get(key)!)}`);
      seen.add(key);
    } else {
      newLines.push(line);
    }
  }

  const appended: string[] = [];
  for (const [key, value] of updates) {
    if (!seen.has(key)) {
      appended.push(`${key}=${quoteIfNeeded(value)}`);
    }
  }
  if (appended.length > 0) {
    if (newLines.length > 0 && newLines[newLines.length - 1] !== "") newLines.push("");
    newLines.push(...appended);
  }

  const envDir = path.dirname(envPath);
  if (!existsSync(envDir)) mkdirSync(envDir, { recursive: true });
  writeFileSync(envPath, newLines.join("\n"), "utf-8");
  try {
    chmodSync(envPath, 0o600);
  } catch {
    // Best-effort permission tightening — Windows / readonly mounts ignore this.
  }
}

function quoteIfNeeded(value: string): string {
  if (/[\s"'#$\\=]/.test(value)) {
    return `"${value.replace(/(["\\])/g, "\\$1")}"`;
  }
  return value;
}

function defaultEnvVarName(presetId: string, takenNames: Set<string>): string {
  const upper = presetId.toUpperCase().replace(/-/g, "_");
  const baseName = `${upper}_API_KEY`;
  if (!takenNames.has(baseName)) return baseName;
  for (let i = 2; i < 100; i++) {
    const candidate = `${upper}_API_KEY_${i}`;
    if (!takenNames.has(candidate)) return candidate;
  }
  return `${baseName}_${Date.now()}`;
}

const providerInputSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase alphanumeric / dashes"),
    preset: z.string().min(1),
    model: z.string().min(1).optional(),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().min(1).optional(),
    apiKeyEnv: z
      .string()
      .min(1)
      .regex(/^[A-Z][A-Z0-9_]*$/, "apiKeyEnv must be UPPER_SNAKE_CASE")
      .optional(),
  })
  .refine((v) => resolvePreset(v.preset) !== null, {
    message: "preset must reference a built-in preset",
    path: ["preset"],
  });

const updateSchema = z.object({
  providers: z.array(providerInputSchema).default([]),
  routing: z
    .object({
      psychologist: z.string().min(1).optional(),
      reflector: z.string().min(1).optional(),
      embedding: z.string().min(1).optional(),
    })
    .default({}),
});

export function llmProvidersSettingsRoutes() {
  const router = Router();

  router.get("/instance/settings/llm-providers", (req, res) => {
    assertBoardOrgAccess(req);
    const { config, source } = readExistingConfig();
    const envPath = resolvePetAgentEnvPath();
    const dotenv = readEnvFile(envPath);

    const presets = BUILTIN_PRESETS.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      wireProtocols: p.wireProtocols,
      defaultBaseUrl: p.defaultBaseUrl,
      defaultModels: p.defaultModels,
      embeddingDims: p.embeddingDims ?? null,
      apiKeyEnvVars: p.apiKeyEnvVars,
      supportsChat:
        p.wireProtocols.includes("anthropic_messages") ||
        p.wireProtocols.includes("openai_chat"),
      supportsEmbedding: p.wireProtocols.includes("openai_embeddings"),
    }));

    const providers = config.providers.map((p) => {
      const preset = resolvePreset(p.preset);
      const envVarName = p.api_key_env ?? null;
      const hasKey =
        envVarName !== null
          ? (process.env[envVarName] ?? dotenv.values.get(envVarName) ?? "").trim().length > 0
          : (p.api_key ?? "").trim().length > 0;
      return {
        id: p.id,
        preset: p.preset,
        presetDisplayName: preset?.displayName ?? p.preset,
        model: p.model ?? null,
        baseUrl: p.base_url ?? null,
        apiKeyEnv: envVarName,
        hasKey,
      };
    });

    res.json({
      presets,
      providers,
      routing: config.llm_routing,
      configSource: source,
      configPath: resolveConfigPath(),
      envPath,
      hasAnyConfiguredProvider: providers.length > 0,
      hasAnyResolvedKey: providers.some((p) => p.hasKey),
    });
  });

  router.post(
    "/instance/settings/llm-providers",
    validate(updateSchema),
    (req, res) => {
      assertCanManageLLMProviders(req);
      const body = req.body as z.infer<typeof updateSchema>;

      const ids = new Set<string>();
      for (const p of body.providers) {
        if (ids.has(p.id)) {
          res.status(400).json({ error: "Duplicate provider id", id: p.id });
          return;
        }
        ids.add(p.id);
      }

      const envPath = resolvePetAgentEnvPath();
      const dotenv = readEnvFile(envPath);
      const envUpdates = new Map<string, string>();
      const takenEnvNames = new Set<string>(dotenv.values.keys());

      const yamlProviders: ProviderEntry[] = body.providers.map((p) => {
        const envVarName = p.apiKeyEnv ?? defaultEnvVarName(p.preset, takenEnvNames);
        takenEnvNames.add(envVarName);
        if (p.apiKey !== undefined) envUpdates.set(envVarName, p.apiKey);
        return {
          id: p.id,
          preset: p.preset,
          api_key_env: envVarName,
          ...(p.model !== undefined ? { model: p.model } : {}),
          ...(p.baseUrl !== undefined ? { base_url: p.baseUrl } : {}),
        };
      });

      const newConfig: PetAgentConfig = {
        providers: yamlProviders,
        llm_routing: {
          ...(body.routing.psychologist !== undefined
            ? { psychologist: body.routing.psychologist }
            : {}),
          ...(body.routing.reflector !== undefined ? { reflector: body.routing.reflector } : {}),
          ...(body.routing.embedding !== undefined ? { embedding: body.routing.embedding } : {}),
        },
      };

      try {
        const yamlText =
          "# Generated by PetAgent UI Settings page.\n# Hand-edit at your own risk; the UI will overwrite this file on next save.\n\n" +
          yaml.dump(newConfig, { lineWidth: 100, noRefs: true });
        parseConfig(yamlText);
        writeFileSync(resolveConfigPath(), yamlText, "utf-8");
      } catch (err) {
        res.status(400).json({
          error: "Config validation failed",
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      if (envUpdates.size > 0) {
        writeEnvFile(envPath, dotenv, envUpdates);
      }

      res.json({
        ok: true,
        configPath: resolveConfigPath(),
        envPath,
        wroteEnvKeys: Array.from(envUpdates.keys()),
        restartRequired: true,
      });
    },
  );

  return router;
}
