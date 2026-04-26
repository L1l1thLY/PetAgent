import { describe, it, expect } from "vitest";
import { parseConfig } from "../config_schema.js";

describe("parseConfig: empty / minimal", () => {
  it("accepts an empty file (returns defaults)", () => {
    const cfg = parseConfig("");
    expect(cfg.providers).toEqual([]);
    expect(cfg.llm_routing).toEqual({});
  });

  it("accepts a config with only providers", () => {
    const cfg = parseConfig(`
providers:
  - id: my-anthropic
    preset: anthropic
    api_key_env: ANTHROPIC_API_KEY
`);
    expect(cfg.providers).toHaveLength(1);
    expect(cfg.providers[0].id).toBe("my-anthropic");
    expect(cfg.llm_routing).toEqual({});
  });

  it("accepts only llm_routing keys that are present (others undefined)", () => {
    const cfg = parseConfig(`
providers:
  - id: a
    preset: anthropic
    api_key_env: K
llm_routing:
  psychologist: a
`);
    expect(cfg.llm_routing.psychologist).toBe("a");
    expect(cfg.llm_routing.reflector).toBeUndefined();
    expect(cfg.llm_routing.embedding).toBeUndefined();
  });
});

describe("parseConfig: provider entry validation", () => {
  it("requires id", () => {
    expect(() =>
      parseConfig(`
providers:
  - preset: anthropic
    api_key_env: K
`),
    ).toThrow(/id|Required/);
  });

  it("requires preset", () => {
    expect(() =>
      parseConfig(`
providers:
  - id: x
    api_key_env: K
`),
    ).toThrow(/preset|Required/);
  });

  it("requires either api_key_env or api_key", () => {
    expect(() =>
      parseConfig(`
providers:
  - id: x
    preset: anthropic
`),
    ).toThrow(/api_key_env|api_key/);
  });

  it("accepts api_key (literal) without api_key_env", () => {
    const cfg = parseConfig(`
providers:
  - id: x
    preset: anthropic
    api_key: sk-ant-literal
`);
    expect(cfg.providers[0].api_key).toBe("sk-ant-literal");
  });

  it("accepts both api_key_env and api_key (env wins at runtime — caller's job)", () => {
    const cfg = parseConfig(`
providers:
  - id: x
    preset: anthropic
    api_key_env: K
    api_key: sk-fallback
`);
    expect(cfg.providers[0].api_key_env).toBe("K");
    expect(cfg.providers[0].api_key).toBe("sk-fallback");
  });

  it("rejects malformed base_url", () => {
    expect(() =>
      parseConfig(`
providers:
  - id: x
    preset: kimi
    api_key_env: K
    base_url: not-a-url
`),
    ).toThrow(/base_url|url/);
  });

  it("accepts valid base_url override", () => {
    const cfg = parseConfig(`
providers:
  - id: x
    preset: kimi
    api_key_env: K
    base_url: https://custom.gateway.example/v1
`);
    expect(cfg.providers[0].base_url).toBe("https://custom.gateway.example/v1");
  });
});

describe("parseConfig: cross-field invariants", () => {
  it("rejects unknown preset", () => {
    expect(() =>
      parseConfig(`
providers:
  - id: x
    preset: nonexistent
    api_key_env: K
`),
    ).toThrow(/unknown preset/);
  });

  it("rejects duplicate provider ids", () => {
    expect(() =>
      parseConfig(`
providers:
  - id: dup
    preset: anthropic
    api_key_env: K1
  - id: dup
    preset: kimi
    api_key_env: K2
`),
    ).toThrow(/duplicate provider id/);
  });

  it("rejects routing target that is not a declared provider", () => {
    expect(() =>
      parseConfig(`
providers:
  - id: a
    preset: anthropic
    api_key_env: K
llm_routing:
  psychologist: ghost
`),
    ).toThrow(/not declared/);
  });

  it("rejects anthropic-only provider as embedding target", () => {
    expect(() =>
      parseConfig(`
providers:
  - id: only-anthropic
    preset: anthropic
    api_key_env: K
llm_routing:
  embedding: only-anthropic
`),
    ).toThrow(/openai_embeddings/);
  });

  it("accepts kimi as embedding target (kimi speaks openai_embeddings)", () => {
    const cfg = parseConfig(`
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
llm_routing:
  embedding: my-kimi
`);
    expect(cfg.llm_routing.embedding).toBe("my-kimi");
  });

  it("accepts anthropic as psychologist/reflector target", () => {
    const cfg = parseConfig(`
providers:
  - id: a
    preset: anthropic
    api_key_env: K
llm_routing:
  psychologist: a
  reflector: a
`);
    expect(cfg.llm_routing.psychologist).toBe("a");
    expect(cfg.llm_routing.reflector).toBe("a");
  });

  it("resolves preset aliases (claude → anthropic) in invariant check", () => {
    const cfg = parseConfig(`
providers:
  - id: a
    preset: claude
    api_key_env: K
llm_routing:
  psychologist: a
`);
    expect(cfg.providers[0].preset).toBe("claude");
  });
});

describe("parseConfig: realistic Hermes-style config", () => {
  it("parses a full Kimi+Minimax mixed config", () => {
    const cfg = parseConfig(`
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
  - id: my-minimax
    preset: minimax
    api_key_env: MINIMAX_API_KEY
    model: abab6.5s-chat

llm_routing:
  psychologist: my-kimi
  reflector: my-minimax
  embedding: my-kimi
`);
    expect(cfg.providers).toHaveLength(2);
    expect(cfg.llm_routing).toEqual({
      psychologist: "my-kimi",
      reflector: "my-minimax",
      embedding: "my-kimi",
    });
  });
});
