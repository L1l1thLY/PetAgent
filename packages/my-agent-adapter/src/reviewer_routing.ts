/**
 * Pure reviewer-routing decision helper (spec §3.4). The Coordinator
 * Router plugin — when it lands — uses this to decide whether to spawn
 * a PetAgent Reviewer sub-issue for an executor, or to skip it because
 * the executor's adapter already self-reviews.
 *
 * Shipping the pure helper + tests in M1+ means the routing semantics
 * are pinned now; wiring it into a real plugin is a thin (future)
 * adapter layer.
 */

import {
  shouldSkipReviewer,
  SKIP_REVIEWER_COMMENT,
  type AdapterCapabilityLookup,
} from "./capabilities.js";

export type ReviewerAction = "skip" | "schedule";

export interface ReviewerRoutingDecision {
  action: ReviewerAction;
  /** User-facing comment to post on the parent issue explaining the decision. */
  comment: string;
  /** The executor whose capability drove the decision. */
  executorAgentId: string;
}

export interface PlanReviewerRoutingInput {
  executorAgentId: string;
  capabilities: AdapterCapabilityLookup;
}

/**
 * Decide whether to schedule a PetAgent Reviewer sub-issue for the
 * given executor. When the executor's adapter self-reviews, we skip
 * and attach the audit comment; otherwise we schedule the Reviewer
 * and attach an informational comment noting that the separate
 * verification pass is queued.
 */
export async function planReviewerRouting(
  input: PlanReviewerRoutingInput,
): Promise<ReviewerRoutingDecision> {
  const skip = await shouldSkipReviewer(
    input.executorAgentId,
    input.capabilities,
  );
  if (skip) {
    return {
      action: "skip",
      comment: SKIP_REVIEWER_COMMENT,
      executorAgentId: input.executorAgentId,
    };
  }
  return {
    action: "schedule",
    comment: "Scheduling PetAgent Reviewer for independent verification (spec §3.4).",
    executorAgentId: input.executorAgentId,
  };
}
