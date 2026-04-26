/**
 * @petagent/skill-miner — pure logic for the M2 G4 weekly skill mining
 * routine. The composition layer (server) wires:
 *   - notes from the agent_notes table → input.notes
 *   - LLMTextTransport from the LLM router (reflector or dedicated
 *     "miner" routing target if configured)
 *   - persists output candidates to the skill_candidates table
 *
 * Zero runtime DB / HTTP coupling — testable end-to-end with fetch
 * mocks via the LLMTextTransport seam.
 */

export { mineSkills } from "./miner.js";
export { buildSystemPrompt, buildUserMessage } from "./prompt.js";
export { parseLlmResponse } from "./parse.js";
export type {
  NoteSummary,
  MineWindow,
  SkillCandidateProposal,
  MineSkillsInput,
  MineSkillsResult,
} from "./types.js";
