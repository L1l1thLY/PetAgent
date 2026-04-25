/**
 * Psychologist-side adapter capability defaults (spec §7.5).
 *
 * Distinct from `@petagent/my-agent-adapter`'s `BUILTIN_ADAPTER_CAPABILITIES`,
 * which carries Coordinator routing flags only (`selfReviewsImplementation`).
 * Conflating the two would couple the Coordinator's reviewer-skip routing
 * to the Psychologist's intervention tier, which spec §3.4 and §7.5 keep
 * separate on purpose.
 */

import type { AdapterCapabilities } from "@petagent/psychologist";

export const PSYCH_CAPABILITY_DEFAULTS: Readonly<Record<string, AdapterCapabilities>> = Object.freeze({
  petagent: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: true,
    supportsIssueSplit: true,
  },
  claude_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  codex_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  cursor: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  opencode_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  gemini_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  hermes_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
});

export const PSYCH_CAPABILITY_FALLBACK: AdapterCapabilities = Object.freeze({
  supportsInstructionsBundle: false,
  supportsBoardComment: true,
  supportsIssuePause: false,
  supportsIssueSplit: false,
});
