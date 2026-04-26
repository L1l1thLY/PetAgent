/**
 * Orchestrator: prompt + LLM call + parse → SkillCandidateProposal[].
 *
 * `mineSkills` is the public entry point used by the routine handler.
 * Pure logic — no DB writes, no HTTP wiring; the caller persists
 * candidates and assigns miningRunId / windowStart / windowEnd.
 */

import { buildSystemPrompt, buildUserMessage } from "./prompt.js";
import { parseLlmResponse } from "./parse.js";
import type { MineSkillsInput, MineSkillsResult } from "./types.js";

const DEFAULT_FREQUENCY_THRESHOLD = 3;
const DEFAULT_MAX_CANDIDATES = 8;
const DEFAULT_MAX_TOKENS = 4096;

export async function mineSkills(input: MineSkillsInput): Promise<MineSkillsResult> {
  if (input.notes.length === 0) {
    return { candidates: [], fellBackToEmpty: false, rawLlmResponse: "" };
  }

  const frequencyThreshold = input.frequencyThreshold ?? DEFAULT_FREQUENCY_THRESHOLD;
  const maxCandidates = input.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Short-circuit: not enough notes to satisfy any pattern.
  if (input.notes.length < frequencyThreshold) {
    return { candidates: [], fellBackToEmpty: false, rawLlmResponse: "" };
  }

  const system = buildSystemPrompt({ frequencyThreshold, maxCandidates });
  const user = buildUserMessage({
    companyId: input.companyId,
    window: input.window,
    notes: input.notes,
  });

  let raw: string;
  try {
    raw = await input.transport.send({
      system,
      userMessage: user,
      maxTokens,
      model: input.model,
    });
  } catch (err) {
    input.logger?.warn?.(
      `[skill-miner] LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { candidates: [], fellBackToEmpty: true, rawLlmResponse: "" };
  }

  const { candidates, fellBackToEmpty } = parseLlmResponse(raw, input.notes);

  // Drop candidates below the frequency floor — even if the LLM ignored
  // its instruction, the threshold is a hard guarantee for downstream UI.
  const filtered = candidates.filter((c) => c.patternFrequency >= frequencyThreshold);

  return {
    candidates: filtered,
    fellBackToEmpty,
    rawLlmResponse: raw,
  };
}
