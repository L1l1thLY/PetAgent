/**
 * Adapter capability registry (spec §3.4).
 *
 * Different adapter types expose different guarantees. For the Coordinator's
 * dispatch decisions (and other routing logic) we need a single place to ask
 * "does this agent's adapter self-review its implementation?".
 *
 * The registry is a lookup surface: given an agentId, return the effective
 * capability record. The baseline is keyed by adapter type; per-agent
 * `adapterConfig.selfReviewsImplementation` (etc.) overrides the baseline.
 *
 * Concrete wiring (drizzle-backed lookup over the agents table) lives in a
 * future server-side integration pass — this module ships the port + a
 * static implementation suitable for unit tests and in-memory composition.
 */

export interface AdapterCapability {
  /** True if the adapter self-reviews implementation output (spec §3.4). */
  selfReviewsImplementation?: boolean;
}

export interface AgentAdapterMetadata {
  agentId: string;
  adapterType: string;
  adapterConfig?: Record<string, unknown> | null;
}

export interface AdapterCapabilityLookup {
  forAgent(agentId: string): Promise<AdapterCapability>;
}

/**
 * Defaults for adapter types PetAgent ships or composes with. External
 * Claude-Code-family adapters already perform a self-review pass during
 * their own agent loop (see Hybrid Team README). PetAgent-native workers
 * do NOT self-review; the separate Reviewer worker owns verification.
 */
export const BUILTIN_ADAPTER_CAPABILITIES: Readonly<Record<string, AdapterCapability>> = Object.freeze({
  claude_local: { selfReviewsImplementation: true },
  codex_local: { selfReviewsImplementation: true },
  cursor: { selfReviewsImplementation: true },
  opencode_local: { selfReviewsImplementation: true },
  gemini_local: { selfReviewsImplementation: true },
  petagent: { selfReviewsImplementation: false },
});

export function mergeCapabilities(
  baseline: AdapterCapability,
  override: AdapterCapability,
): AdapterCapability {
  const merged: AdapterCapability = { ...baseline };
  if (override.selfReviewsImplementation !== undefined) {
    merged.selfReviewsImplementation = override.selfReviewsImplementation;
  }
  return merged;
}

/**
 * Extract a per-agent capability override from `adapterConfig`. Only the
 * capability fields we recognize are carried forward; other keys in
 * `adapterConfig` are ignored at this layer.
 */
export function capabilityOverrideFrom(
  adapterConfig: Record<string, unknown> | null | undefined,
): AdapterCapability {
  const out: AdapterCapability = {};
  if (adapterConfig && typeof adapterConfig === "object") {
    const flag = adapterConfig.selfReviewsImplementation;
    if (typeof flag === "boolean") out.selfReviewsImplementation = flag;
  }
  return out;
}

export interface StaticCapabilityLookupOptions {
  /** Override baseline defaults per adapter type. Defaults to `BUILTIN_ADAPTER_CAPABILITIES`. */
  defaults?: Readonly<Record<string, AdapterCapability>>;
}

export class StaticCapabilityLookup implements AdapterCapabilityLookup {
  private readonly defaults: Readonly<Record<string, AdapterCapability>>;

  constructor(
    private readonly agents: ReadonlyArray<AgentAdapterMetadata>,
    opts: StaticCapabilityLookupOptions = {},
  ) {
    this.defaults = opts.defaults ?? BUILTIN_ADAPTER_CAPABILITIES;
  }

  async forAgent(agentId: string): Promise<AdapterCapability> {
    const agent = this.agents.find((a) => a.agentId === agentId);
    if (!agent) return {};
    const baseline = this.defaults[agent.adapterType] ?? {};
    const override = capabilityOverrideFrom(agent.adapterConfig);
    return mergeCapabilities(baseline, override);
  }
}

/**
 * Pure dispatch helper used by the Coordinator's Router plugin (spec §3.4).
 * When the executor's adapter self-reviews, the Coordinator SKIPS creating
 * a child PetAgent Reviewer Issue — but a visible comment is still written
 * so the user can audit the decision.
 */
export async function shouldSkipReviewer(
  executorAgentId: string,
  capabilities: AdapterCapabilityLookup,
): Promise<boolean> {
  const cap = await capabilities.forAgent(executorAgentId);
  return cap.selfReviewsImplementation === true;
}

export const SKIP_REVIEWER_COMMENT =
  "Skipped PetAgent Reviewer: executor adapter self-reviews (spec §3.4).";
