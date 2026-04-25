import { describe, it, expect } from "vitest";
import { DrizzleCapabilitiesProvider } from "../psychologist/drizzle_capabilities_provider.js";
import {
  PSYCH_CAPABILITY_DEFAULTS,
  PSYCH_CAPABILITY_FALLBACK,
} from "../psychologist/psych_capability_registry.js";

function makeFakeDb(rows: Array<{ adapterType: string }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  } as unknown as import("@petagent/db").Db;
}

describe("DrizzleCapabilitiesProvider.forAgent", () => {
  it("returns the registry record for a known adapter", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([{ adapterType: "petagent" }]),
    });
    const caps = await provider.forAgent("agent-1");
    expect(caps).toEqual(PSYCH_CAPABILITY_DEFAULTS.petagent);
  });

  it("returns fallback (Board Comment only) for an unknown adapter", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([{ adapterType: "imaginary_adapter" }]),
    });
    const caps = await provider.forAgent("agent-1");
    expect(caps).toEqual(PSYCH_CAPABILITY_FALLBACK);
  });

  it("returns all-false when the agent row is missing", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([]),
    });
    const caps = await provider.forAgent("ghost");
    expect(caps).toEqual({
      supportsInstructionsBundle: false,
      supportsBoardComment: false,
      supportsIssuePause: false,
      supportsIssueSplit: false,
    });
  });

  it("honors a custom defaults map", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([{ adapterType: "synthetic" }]),
      defaults: {
        synthetic: {
          supportsInstructionsBundle: true,
          supportsBoardComment: true,
          supportsIssuePause: true,
          supportsIssueSplit: true,
        },
      },
    });
    const caps = await provider.forAgent("agent-1");
    expect(caps.supportsIssuePause).toBe(true);
  });

  it("honors a custom fallback", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([{ adapterType: "imaginary_adapter" }]),
      fallback: {
        supportsInstructionsBundle: false,
        supportsBoardComment: false,
        supportsIssuePause: false,
        supportsIssueSplit: true,
      },
    });
    const caps = await provider.forAgent("agent-1");
    expect(caps.supportsIssueSplit).toBe(true);
  });
});
