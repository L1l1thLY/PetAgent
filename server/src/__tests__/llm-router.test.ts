import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AnthropicMessagesTransport,
  OpenAIChatCompletionsTransport,
  OpenAIEmbeddingsTransport,
} from "@petagent/llm-providers";
import { createLLMRouter } from "../composition/llm-router.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "petagent-llm-router-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(content: string): string {
  const p = path.join(tmp, "petagent.config.yaml");
  writeFileSync(p, content, "utf-8");
  return p;
}

describe("createLLMRouter: env-fallback (no config file)", () => {
  it("returns nothing when no envs and no config", () => {
    const router = createLLMRouter({
      env: {},
      configPath: path.join(tmp, "missing.yaml"),
    });
    expect(router.getTextTransport("psychologist")).toBeNull();
    expect(router.getTextTransport("reflector")).toBeNull();
    expect(router.getEmbeddingTransport()).toBeNull();
    expect(router.describeRouting()).toEqual([]);
  });

  it("falls back to anthropic when ANTHROPIC_API_KEY set", () => {
    const router = createLLMRouter({
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
      configPath: path.join(tmp, "missing.yaml"),
    });
    const psy = router.getTextTransport("psychologist");
    const refl = router.getTextTransport("reflector");
    expect(psy?.transport).toBeInstanceOf(AnthropicMessagesTransport);
    expect(refl?.transport).toBeInstanceOf(AnthropicMessagesTransport);
    expect(psy?.model).toBe("claude-haiku-4-5-20251001");
    expect(router.getEmbeddingTransport()).toBeNull();

    const desc = router.describeRouting();
    expect(desc).toHaveLength(2);
    expect(desc[0]).toEqual({
      subsystem: "psychologist",
      providerId: "_bc_anthropic",
      preset: "anthropic",
      wireProtocol: "anthropic_messages",
      model: "claude-haiku-4-5-20251001",
      source: "env-fallback",
    });
  });

  it("falls back to openai for embedding when OPENAI_API_KEY set", () => {
    const router = createLLMRouter({
      env: { OPENAI_API_KEY: "sk-openai-test" },
      configPath: path.join(tmp, "missing.yaml"),
    });
    const emb = router.getEmbeddingTransport();
    expect(emb?.transport).toBeInstanceOf(OpenAIEmbeddingsTransport);
    expect(emb?.model).toBe("text-embedding-3-small");
    expect(router.getTextTransport("psychologist")).toBeNull();
  });

  it("respects OPENAI_EMBEDDING_MODEL override in fallback", () => {
    const router = createLLMRouter({
      env: {
        OPENAI_API_KEY: "sk",
        OPENAI_EMBEDDING_MODEL: "text-embedding-3-large",
      },
      configPath: path.join(tmp, "missing.yaml"),
    });
    const emb = router.getEmbeddingTransport();
    expect(emb?.model).toBe("text-embedding-3-large");
  });

  it("combines both fallbacks when both keys present", () => {
    const router = createLLMRouter({
      env: { ANTHROPIC_API_KEY: "k1", OPENAI_API_KEY: "k2" },
      configPath: path.join(tmp, "missing.yaml"),
    });
    expect(router.describeRouting()).toHaveLength(3);
  });
});

describe("createLLMRouter: YAML config loading", () => {
  it("routes psychologist to a Kimi provider when configured", () => {
    const cfgPath = writeConfig(`
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
llm_routing:
  psychologist: my-kimi
  reflector: my-kimi
`);
    const router = createLLMRouter({
      env: { KIMI_API_KEY: "sk-kimi-test" },
      configPath: cfgPath,
    });
    const psy = router.getTextTransport("psychologist");
    expect(psy?.transport).toBeInstanceOf(OpenAIChatCompletionsTransport);
    expect(psy?.model).toBe("moonshot-v1-32k");

    const desc = router.describeRouting();
    expect(desc[0]).toEqual({
      subsystem: "psychologist",
      providerId: "my-kimi",
      preset: "kimi",
      wireProtocol: "openai_chat",
      model: "moonshot-v1-32k",
      source: "config",
    });
  });

  it("model override from config wins over preset default", () => {
    const cfgPath = writeConfig(`
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
    model: moonshot-v1-128k
llm_routing:
  reflector: my-kimi
`);
    const router = createLLMRouter({
      env: { KIMI_API_KEY: "k" },
      configPath: cfgPath,
    });
    expect(router.getTextTransport("reflector")?.model).toBe("moonshot-v1-128k");
  });

  it("api_key inline works when api_key_env missing", () => {
    const cfgPath = writeConfig(`
providers:
  - id: x
    preset: anthropic
    api_key: sk-ant-literal
llm_routing:
  psychologist: x
`);
    const router = createLLMRouter({ env: {}, configPath: cfgPath });
    expect(router.getTextTransport("psychologist")).not.toBeNull();
  });

  it("api_key_env wins over api_key when both present", () => {
    const cfgPath = writeConfig(`
providers:
  - id: x
    preset: anthropic
    api_key_env: REAL_KEY
    api_key: sk-fallback-literal
llm_routing:
  psychologist: x
`);
    const router = createLLMRouter({
      env: { REAL_KEY: "from-env" },
      configPath: cfgPath,
    });
    // Both routes succeed; we can't introspect the apiKey, but absence of
    // null verifies the routing succeeded.
    expect(router.getTextTransport("psychologist")).not.toBeNull();
  });

  it("returns null and warns when api key missing", () => {
    const warnings: string[] = [];
    const cfgPath = writeConfig(`
providers:
  - id: x
    preset: kimi
    api_key_env: KIMI_API_KEY
llm_routing:
  psychologist: x
`);
    const router = createLLMRouter({
      env: {},
      configPath: cfgPath,
      logger: { warn: (m) => warnings.push(m) },
    });
    expect(router.getTextTransport("psychologist")).toBeNull();
    expect(warnings.some((w) => /api key not found/.test(w))).toBe(true);
  });

  it("falls back through preset's apiKeyEnvVars (KIMI_API_KEY then MOONSHOT_API_KEY)", () => {
    const cfgPath = writeConfig(`
providers:
  - id: x
    preset: kimi
    api_key_env: NONE_SET
llm_routing:
  psychologist: x
`);
    const router = createLLMRouter({
      env: { MOONSHOT_API_KEY: "fallback" },
      configPath: cfgPath,
    });
    expect(router.getTextTransport("psychologist")).not.toBeNull();
  });

  it("routes embedding to kimi when configured", () => {
    const cfgPath = writeConfig(`
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
llm_routing:
  embedding: my-kimi
`);
    const router = createLLMRouter({
      env: { KIMI_API_KEY: "k" },
      configPath: cfgPath,
    });
    const emb = router.getEmbeddingTransport();
    expect(emb?.transport).toBeInstanceOf(OpenAIEmbeddingsTransport);
    expect(emb?.model).toBe("moonshot-v1-embedding");
  });

  it("rejects misconfigured embedding target at config-load time (anthropic-only)", () => {
    const cfgPath = writeConfig(`
providers:
  - id: only-anthropic
    preset: anthropic
    api_key_env: ANTHROPIC_API_KEY
llm_routing:
  embedding: only-anthropic
`);
    expect(() =>
      createLLMRouter({ env: { ANTHROPIC_API_KEY: "k" }, configPath: cfgPath }),
    ).toThrow(/openai_embeddings/);
  });

  it("describeRouting is empty when YAML has no llm_routing block", () => {
    const cfgPath = writeConfig(`
providers:
  - id: x
    preset: kimi
    api_key_env: KIMI_API_KEY
`);
    const router = createLLMRouter({
      env: { KIMI_API_KEY: "k" },
      configPath: cfgPath,
    });
    expect(router.describeRouting()).toEqual([]);
  });

  it("PETAGENT_LLM_CONFIG env var overrides default path", () => {
    const cfgPath = writeConfig(`
providers:
  - id: a
    preset: anthropic
    api_key_env: ANTHROPIC_API_KEY
llm_routing:
  psychologist: a
`);
    const router = createLLMRouter({
      env: {
        ANTHROPIC_API_KEY: "k",
        PETAGENT_LLM_CONFIG: cfgPath,
      },
    });
    expect(router.getTextTransport("psychologist")).not.toBeNull();
  });
});

describe("createLLMRouter: Hermes-style mixed routing", () => {
  it("psychologist=Kimi + reflector=Minimax + embedding=Kimi all work", () => {
    const cfgPath = writeConfig(`
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
  - id: my-minimax
    preset: minimax
    api_key_env: MINIMAX_API_KEY
llm_routing:
  psychologist: my-kimi
  reflector: my-minimax
  embedding: my-kimi
`);
    const router = createLLMRouter({
      env: { KIMI_API_KEY: "kk", MINIMAX_API_KEY: "mm" },
      configPath: cfgPath,
    });
    expect(router.getTextTransport("psychologist")?.transport).toBeInstanceOf(
      OpenAIChatCompletionsTransport,
    );
    expect(router.getTextTransport("reflector")?.transport).toBeInstanceOf(
      OpenAIChatCompletionsTransport,
    );
    expect(router.getEmbeddingTransport()?.transport).toBeInstanceOf(
      OpenAIEmbeddingsTransport,
    );
    const desc = router.describeRouting();
    expect(desc.map((d) => `${d.subsystem}:${d.preset}`).sort()).toEqual([
      "embedding:kimi",
      "psychologist:kimi",
      "reflector:minimax",
    ]);
  });
});
