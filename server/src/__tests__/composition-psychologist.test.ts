import { describe, it, expect } from "vitest";
import { HookBus } from "@petagent/hooks";
import { createPsychologist } from "../composition/psychologist.js";
import type { LLMRouter } from "../composition/llm-router.js";
import type { Config } from "../config.js";
import type { Db } from "@petagent/db";
import type { LLMTextTransport } from "@petagent/llm-providers";

const baseConfig: Pick<Config, "psychologistEnabled" | "psychologistActorAgentId"> = {
  psychologistEnabled: false,
  psychologistActorAgentId: null,
};

const fakeDb = {} as unknown as Db;

const fakeTransport: LLMTextTransport = {
  async send() {
    return "{}";
  },
};

function fakeRouter(opts: { textTransport?: { transport: LLMTextTransport; model: string } } = {}): LLMRouter {
  return {
    getTextTransport: () => opts.textTransport ?? null,
    getEmbeddingTransport: () => null,
    describeRouting: () => [],
  };
}

describe("createPsychologist", () => {
  it("returns null when disabled", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: baseConfig as Config,
      router: fakeRouter(),
    });
    expect(out).toBeNull();
  });

  it("uses BehavioralPassthrough classifier when router returns null", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { ...baseConfig, psychologistEnabled: true } as Config,
      router: fakeRouter(),
    });
    expect(out).not.toBeNull();
    expect(out!.classifierKind).toBe("passthrough");
  });

  it("uses Prompted classifier when router supplies a transport", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { ...baseConfig, psychologistEnabled: true } as Config,
      router: fakeRouter({
        textTransport: { transport: fakeTransport, model: "claude-haiku-4-5-20251001" },
      }),
    });
    expect(out).not.toBeNull();
    expect(out!.classifierKind).toBe("prompted");
  });
});
