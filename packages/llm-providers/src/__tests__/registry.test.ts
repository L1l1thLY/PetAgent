import { describe, it, expect } from "vitest";
import {
  BUILTIN_PRESETS,
  ALIASES,
  resolvePreset,
  listPresetIds,
} from "../registry.js";

describe("registry: BUILTIN_PRESETS shape invariants", () => {
  it("has exactly 9 v1 presets", () => {
    expect(BUILTIN_PRESETS).toHaveLength(9);
  });

  it("each preset has at least one wire protocol", () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.wireProtocols.length).toBeGreaterThan(0);
    }
  });

  it("each preset has a default base URL for every wire protocol it advertises", () => {
    for (const p of BUILTIN_PRESETS) {
      for (const wp of p.wireProtocols) {
        expect(p.defaultBaseUrl[wp]).toBeTruthy();
      }
    }
  });

  it("each preset has a default model for every wire protocol it advertises", () => {
    for (const p of BUILTIN_PRESETS) {
      for (const wp of p.wireProtocols) {
        expect(p.defaultModels[wp]).toBeTruthy();
      }
    }
  });

  it("each embedding-capable preset declares embedding dimensions", () => {
    for (const p of BUILTIN_PRESETS) {
      if (!p.wireProtocols.includes("openai_embeddings")) {
        expect(p.embeddingDims).toBeUndefined();
        continue;
      }
      expect(p.embeddingDims).toBeGreaterThan(0);
      expect(Number.isInteger(p.embeddingDims)).toBe(true);
    }
  });

  it("each preset declares at least one API key env var", () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.apiKeyEnvVars.length).toBeGreaterThan(0);
    }
  });

  it("preset ids are unique", () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preset ids are lowercase kebab-case (no spaces, no underscores)", () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe("registry: ships expected v1 set", () => {
  const expectedIds = [
    "anthropic",
    "openai",
    "kimi",
    "kimi-coding",
    "minimax",
    "minimax-cn",
    "deepseek",
    "zai",
    "gemini",
  ];

  it.each(expectedIds)("includes %s", (id) => {
    expect(listPresetIds()).toContain(id);
  });
});

describe("resolvePreset", () => {
  it("returns a preset by exact id", () => {
    const p = resolvePreset("kimi");
    expect(p?.id).toBe("kimi");
  });

  it("is case-insensitive", () => {
    const p = resolvePreset("KIMI");
    expect(p?.id).toBe("kimi");
  });

  it("trims whitespace", () => {
    const p = resolvePreset("  kimi  ");
    expect(p?.id).toBe("kimi");
  });

  it("returns null for unknown id", () => {
    expect(resolvePreset("nonexistent")).toBeNull();
  });

  it("returns null for empty/whitespace input", () => {
    expect(resolvePreset("")).toBeNull();
    expect(resolvePreset("   ")).toBeNull();
  });

  it("resolves aliases: claude → anthropic", () => {
    expect(resolvePreset("claude")?.id).toBe("anthropic");
  });

  it("resolves aliases: moonshot → kimi", () => {
    expect(resolvePreset("moonshot")?.id).toBe("kimi");
  });

  it("resolves kimi-coding directly as a preset", () => {
    expect(resolvePreset("kimi-coding")?.id).toBe("kimi-coding");
  });

  it("reports kimi-coding embedding dimensions", () => {
    expect(resolvePreset("kimi-coding")?.embeddingDims).toBe(1024);
  });

  it("resolves aliases: glm → zai", () => {
    expect(resolvePreset("glm")?.id).toBe("zai");
  });

  it("resolves aliases: zhipu → zai", () => {
    expect(resolvePreset("zhipu")?.id).toBe("zai");
  });

  it("resolves aliases: google → gemini", () => {
    expect(resolvePreset("google")?.id).toBe("gemini");
  });
});

describe("ALIASES table", () => {
  it("never aliases to itself", () => {
    for (const [from, to] of Object.entries(ALIASES)) {
      expect(from).not.toBe(to);
    }
  });

  it("every alias target resolves to a real preset", () => {
    for (const target of Object.values(ALIASES)) {
      expect(BUILTIN_PRESETS.some((p) => p.id === target)).toBe(true);
    }
  });
});

describe("registry: protocol coverage", () => {
  it("at least one preset speaks anthropic_messages", () => {
    expect(
      BUILTIN_PRESETS.some((p) => p.wireProtocols.includes("anthropic_messages")),
    ).toBe(true);
  });

  it("at least one preset speaks openai_chat", () => {
    expect(
      BUILTIN_PRESETS.some((p) => p.wireProtocols.includes("openai_chat")),
    ).toBe(true);
  });

  it("at least one preset speaks openai_embeddings", () => {
    expect(
      BUILTIN_PRESETS.some((p) => p.wireProtocols.includes("openai_embeddings")),
    ).toBe(true);
  });
});
