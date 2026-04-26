import { describe, it, expect } from "vitest";
import { HookBus } from "@petagent/hooks";
import { createPsychologist } from "../composition/psychologist.js";
import type { Config } from "../config.js";
import type { Db } from "@petagent/db";

const baseConfig: Pick<Config, "psychologistEnabled" | "psychologistActorAgentId"> = {
  psychologistEnabled: false,
  psychologistActorAgentId: null,
};

const fakeDb = {} as unknown as Db;

describe("createPsychologist", () => {
  it("returns null when disabled", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: baseConfig as Config,
      resolveAnthropicKey: () => null,
    });
    expect(out).toBeNull();
  });

  it("uses BehavioralPassthrough classifier when no API key", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { ...baseConfig, psychologistEnabled: true } as Config,
      resolveAnthropicKey: () => null,
    });
    expect(out).not.toBeNull();
    expect(out!.classifierKind).toBe("passthrough");
  });

  it("uses Prompted classifier when API key present", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { ...baseConfig, psychologistEnabled: true } as Config,
      resolveAnthropicKey: () => "sk-ant-test",
    });
    expect(out).not.toBeNull();
    expect(out!.classifierKind).toBe("prompted");
  });
});
