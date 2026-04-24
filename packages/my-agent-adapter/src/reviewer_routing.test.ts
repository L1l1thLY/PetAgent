import { describe, it, expect } from "vitest";
import { planReviewerRouting } from "./reviewer_routing.js";
import {
  StaticCapabilityLookup,
  SKIP_REVIEWER_COMMENT,
  type AgentAdapterMetadata,
} from "./capabilities.js";

const AGENTS: AgentAdapterMetadata[] = [
  { agentId: "a-claude", adapterType: "claude_local" },
  { agentId: "a-petagent", adapterType: "petagent" },
  {
    agentId: "a-override-skip",
    adapterType: "petagent",
    adapterConfig: { selfReviewsImplementation: true },
  },
  {
    agentId: "a-override-force",
    adapterType: "claude_local",
    adapterConfig: { selfReviewsImplementation: false },
  },
  { agentId: "a-unknown", adapterType: "totally_new_v99" },
];

describe("planReviewerRouting", () => {
  it("skips when the executor's adapter self-reviews", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    const decision = await planReviewerRouting({
      executorAgentId: "a-claude",
      capabilities: lookup,
    });
    expect(decision.action).toBe("skip");
    expect(decision.comment).toBe(SKIP_REVIEWER_COMMENT);
    expect(decision.executorAgentId).toBe("a-claude");
  });

  it("schedules when the executor's adapter does not self-review", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    const decision = await planReviewerRouting({
      executorAgentId: "a-petagent",
      capabilities: lookup,
    });
    expect(decision.action).toBe("schedule");
    expect(decision.comment).toMatch(/Scheduling PetAgent Reviewer/);
  });

  it("fails closed (schedules) on unknown agents", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    const decision = await planReviewerRouting({
      executorAgentId: "never-seen",
      capabilities: lookup,
    });
    expect(decision.action).toBe("schedule");
  });

  it("per-agent override flips a petagent executor to skip", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    const decision = await planReviewerRouting({
      executorAgentId: "a-override-skip",
      capabilities: lookup,
    });
    expect(decision.action).toBe("skip");
  });

  it("per-agent override forces a claude_local executor to schedule", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    const decision = await planReviewerRouting({
      executorAgentId: "a-override-force",
      capabilities: lookup,
    });
    expect(decision.action).toBe("schedule");
  });

  it("fails closed on unknown adapter type (no baseline entry)", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    const decision = await planReviewerRouting({
      executorAgentId: "a-unknown",
      capabilities: lookup,
    });
    expect(decision.action).toBe("schedule");
  });

  it("the skip comment references spec §3.4 for audit traceability", async () => {
    const lookup = new StaticCapabilityLookup(AGENTS);
    const decision = await planReviewerRouting({
      executorAgentId: "a-claude",
      capabilities: lookup,
    });
    expect(decision.comment).toMatch(/§3\.4/);
  });
});
