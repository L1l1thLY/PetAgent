import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HookBus } from "@petagent/hooks";
import { createReflector } from "../composition/reflector.js";
import type { LLMRouter } from "../composition/llm-router.js";
import type { Config } from "../config.js";
import type { Db } from "@petagent/db";
import type { EmbeddingTransport, LLMTextTransport } from "@petagent/llm-providers";

const fakeDb = {} as unknown as Db;

const fakeTextTransport: LLMTextTransport = {
  async send() {
    return "fake reflection";
  },
};

const fakeEmbeddingTransport: EmbeddingTransport = {
  async embed(texts) {
    return texts.map(() => Array(1536).fill(0));
  },
};

function fakeRouter(opts: {
  textTransport?: { transport: LLMTextTransport; model: string };
  embeddingTransport?: { transport: EmbeddingTransport; model: string };
} = {}): LLMRouter {
  return {
    getTextTransport: () => opts.textTransport ?? null,
    getEmbeddingTransport: () => opts.embeddingTransport ?? null,
    describeRouting: () => [],
  };
}

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "petagent-reflector-factory-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("createReflector", () => {
  it("returns null when disabled", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: {
        reflectorEnabled: false,
        notesGitStoreDir: tmpRoot,
      } as Config,
      router: fakeRouter(),
    });
    expect(out).toBeNull();
  });

  it("returns a startable instance when enabled", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: {
        reflectorEnabled: true,
        notesGitStoreDir: tmpRoot,
      } as Config,
      router: fakeRouter(),
    });
    expect(out).not.toBeNull();
    expect(typeof out!.start).toBe("function");
    expect(typeof out!.stop).toBe("function");
  });
});

describe("createReflector builder selection", () => {
  it("uses templated builder when router returns no chat transport", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { reflectorEnabled: true, notesGitStoreDir: tmpRoot } as Config,
      router: fakeRouter(),
    });
    expect(out).not.toBeNull();
    expect(out!.builderKind).toBe("templated");
  });

  it("uses Haiku builder when router supplies a chat transport", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { reflectorEnabled: true, notesGitStoreDir: tmpRoot } as Config,
      router: fakeRouter({
        textTransport: { transport: fakeTextTransport, model: "claude-haiku-4-5-20251001" },
      }),
    });
    expect(out).not.toBeNull();
    expect(out!.builderKind).toBe("haiku");
  });
});
