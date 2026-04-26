/**
 * Pure types for SkillMiner (M2 G4 §5.2 周批 Skill 挖掘).
 *
 * Zero runtime dependency on the DB or HTTP — composition wires the
 * inputs (notes from the DB) and outputs (candidates → DB row) at the
 * server layer.
 */

import type { LLMTextTransport } from "@petagent/llm-providers";

export interface NoteSummary {
  id: string;
  agentId: string;
  noteType: string;
  body: string;
  tags?: string[] | null;
  createdAt?: Date | string;
}

export interface MineWindow {
  start: Date;
  end: Date;
}

export interface SkillCandidateProposal {
  name: string;
  title: string;
  body: string;
  rationale: string;
  sourceNoteIds: string[];
  patternFrequency: number;
  /** Set when every sourceNoteIds entry shares one agent; null otherwise. */
  agentId: string | null;
}

export interface MineSkillsInput {
  companyId: string;
  notes: NoteSummary[];
  window: MineWindow;
  transport: LLMTextTransport;
  model: string;
  /** Minimum number of distinct notes a pattern must touch to qualify. */
  frequencyThreshold?: number;
  /** Soft cap on number of candidates the LLM should propose. */
  maxCandidates?: number;
  /** Per-LLM-call max tokens (output). Default 4096. */
  maxTokens?: number;
  logger?: { warn(msg: string, meta?: unknown): void };
}

export interface MineSkillsResult {
  candidates: SkillCandidateProposal[];
  /** True when LLM returned malformed JSON and we fell back to empty. */
  fellBackToEmpty: boolean;
  /** Raw LLM response text — useful for debugging / audit logs. */
  rawLlmResponse: string;
}
