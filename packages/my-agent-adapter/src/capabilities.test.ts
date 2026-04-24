import { describe, it, expect } from "vitest";
import {
  BUILTIN_ADAPTER_CAPABILITIES,
  StaticCapabilityLookup,
  capabilityOverrideFrom,
  mergeCapabilities,
  shouldSkipReviewer,
  SKIP_REVIEWER_COMMENT,
  type AgentAdapterMetadata,
} from "./capabilities.js";

const AGENTS: AgentAdapterMetadata[] = [
  { agentId: "a-petagent", adapterType: "petagent" },
  { agentId: "a-claude", adapterType: "claude_local" },
  { agentId: "a-mystery", adapterType: "some_new_adapter_v99" },
  {
    agentId: "a-override-on",
    adapterType: "petagent",
    adapterConfig: { selfReviewsImplementation: true },
  },
  {
    agentId: "a-override-off",
    adapterType: "claude_local",
    adapterConfig: { selfReviewsImplementation: false },
  },
];

describe("BUILTIN_ADAPTER_CAPABILITIES", () => {
  it("marks claude_local as self-reviewing", () => {
    expect(BUILTIN_ADAPTER_CAPABILITIES.claude_local?.selfReviewsImplementation).toBe(true);
  });

  it("marks petagent as NOT self-reviewing", () => {
    expect(BUILTIN_ADAPTER_CAPABILITIES.petagent?.selfReviewsImplementation).toBe(false);
  });

  it("is frozen (cannot be mutated at runtime)", () => {
    expect(Object.isFrozen(BUILTIN_ADAPTER_CAPABILITIES)).toBe(true);
  });
});

describe("capabilityOverrideFrom", () => {
  it("returns {} for null / undefined / empty config", () => {
    expect(capabilityOverrideFrom(null)).toEqual({});
    expect(capabilityOverrideFrom(undefined)).toEqual({});
    expect(capabilityOverrideFrom({})).toEqual({});
  });

  it("extracts selfReviewsImplementation when present as boolean", () => {
    expect(capabilityOverrideFrom({ selfReviewsImplementation: true })).toEqual({
      selfReviewsImplementation: true,
    });
    expect(capabilityOverrideFrom({ selfReviewsImplementation: false })).toEqual({
      selfReviewsImplementation: false,
    });
  });

  it("ignores non-boolean values", () => {
    expect(capabilityOverrideFrom({ selfReviewsImplementation: "yes" })).toEqual({});
    expect(capabilityOverrideFrom({ selfReviewsImplementation: 1 })).toEqual({});
  });

  it("ignores unrelated keys", () => {
    expect(
      capabilityOverrideFrom({
        roleType: "worker/executor",
        someRandomKey: true,
      }),
    ).toEqual({});
  });
});

describe("mergeCapabilities", () => {
  it("override wins over baseline", () => {
    expect(
      mergeCapabilities(
        { selfReviewsImplementation: true },
        { selfReviewsImplementation: false },
      ),
    ).toEqual({ selfReviewsImplementation: false });
  });

  it("preserves baseline when override is empty", () => {
    expect(mergeCapabilities({ selfReviewsImplementation: true }, {})).toEqual({
      selfReviewsImplementation: true,
    });
  });
});

describe("StaticCapabilityLookup", () => {
  it("returns the adapter-type baseline for a known agent", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await lookup.forAgent("a-claude")).toEqual({ selfReviewsImplementation: true });
    expect(await lookup.forAgent("a-petagent")).toEqual({ selfReviewsImplementation: false });
  });

  it("returns {} when the agentId is not registered", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await lookup.forAgent("does-not-exist")).toEqual({});
  });

  it("returns {} when the adapter type has no baseline entry", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await lookup.forAgent("a-mystery")).toEqual({});
  });

  it("per-agent override wins over adapter-type baseline (flipping on)", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await lookup.forAgent("a-override-on")).toEqual({
      selfReviewsImplementation: true,
    });
  });

  it("per-agent override wins over adapter-type baseline (flipping off)", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await lookup.forAgent("a-override-off")).toEqual({
      selfReviewsImplementation: false,
    });
  });

  it("accepts a custom defaults override", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS, {
      defaults: { petagent: { selfReviewsImplementation: true } },
    });
    expect(await lookup.forAgent("a-petagent")).toEqual({
      selfReviewsImplementation: true,
    });
  });
});

describe("shouldSkipReviewer", () => {
  it("returns true for a claude_local agent (self-reviews)", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await shouldSkipReviewer("a-claude", lookup)).toBe(true);
  });

  it("returns false for a petagent agent (does not self-review)", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await shouldSkipReviewer("a-petagent", lookup)).toBe(false);
  });

  it("returns false when the agent is unknown (fail-closed: always review)", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await shouldSkipReviewer("does-not-exist", lookup)).toBe(false);
  });

  it("respects per-agent override that forces a PetAgent executor to self-review", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await shouldSkipReviewer("a-override-on", lookup)).toBe(true);
  });

  it("respects per-agent override that forces a Claude executor NOT to self-review", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    expect(await shouldSkipReviewer("a-override-off", lookup)).toBe(false);
  });
});

describe("SKIP_REVIEWER_COMMENT", () => {
  it("references spec §3.4 for audit traceability", () => {
    expect(SKIP_REVIEWER_COMMENT).toMatch(/§3\.4/);
    expect(SKIP_REVIEWER_COMMENT).toMatch(/Skipped/);
  });
});
