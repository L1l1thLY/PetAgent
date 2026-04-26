/**
 * Parse the LLM's JSON response into validated SkillCandidateProposal[].
 *
 * Tolerant: accepts optional ```json fences, trailing prose, or
 * `<answer>` wrappers some models emit. Discards individual proposals
 * that are missing required fields rather than failing the whole batch.
 */

import type { NoteSummary, SkillCandidateProposal } from "./types.js";

export interface ParseResult {
  candidates: SkillCandidateProposal[];
  fellBackToEmpty: boolean;
}

export function parseLlmResponse(
  raw: string,
  notes: NoteSummary[],
): ParseResult {
  const json = extractJsonArray(raw);
  if (json === null) return { candidates: [], fellBackToEmpty: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { candidates: [], fellBackToEmpty: true };
  }
  if (!Array.isArray(parsed)) return { candidates: [], fellBackToEmpty: true };

  const validNoteIds = new Set(notes.map((n) => n.id));
  const noteAgentMap = new Map(notes.map((n) => [n.id, n.agentId]));

  const out: SkillCandidateProposal[] = [];
  for (const item of parsed) {
    const candidate = validateCandidate(item, validNoteIds, noteAgentMap);
    if (candidate !== null) out.push(candidate);
  }
  return { candidates: out, fellBackToEmpty: false };
}

function extractJsonArray(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Strip ```json ... ``` fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Find the first '[' and last ']' — handles trailing prose
  const firstBracket = candidate.indexOf("[");
  const lastBracket = candidate.lastIndexOf("]");
  if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
    return null;
  }
  return candidate.slice(firstBracket, lastBracket + 1);
}

function validateCandidate(
  item: unknown,
  validNoteIds: Set<string>,
  noteAgentMap: Map<string, string>,
): SkillCandidateProposal | null {
  if (typeof item !== "object" || item === null) return null;
  const o = item as Record<string, unknown>;

  const name = sanitizeSlug(o.name);
  const title = sanitizeString(o.title, 200);
  const body = sanitizeString(o.body, 8000);
  const rationale = sanitizeString(o.rationale, 1000) ?? "";
  if (name === null || title === null || body === null) return null;

  const sourceNoteIds = Array.isArray(o.sourceNoteIds)
    ? o.sourceNoteIds.filter((id): id is string => typeof id === "string" && validNoteIds.has(id))
    : [];
  if (sourceNoteIds.length === 0) return null;

  const patternFrequency =
    typeof o.patternFrequency === "number" && Number.isFinite(o.patternFrequency)
      ? Math.max(1, Math.min(sourceNoteIds.length, Math.floor(o.patternFrequency)))
      : sourceNoteIds.length;

  // Reconcile agentId: derived purely from the source notes. The LLM's
  // self-reported `agentId` field is ignored — observed-agent set is
  // ground truth. If all source notes share one agent, use it; else null.
  const observedAgents = new Set(
    sourceNoteIds.map((id) => noteAgentMap.get(id)).filter((a): a is string => typeof a === "string"),
  );
  const agentId: string | null = observedAgents.size === 1 ? [...observedAgents][0] : null;

  return {
    name,
    title,
    body,
    rationale,
    sourceNoteIds,
    patternFrequency,
    agentId,
  };
}

function sanitizeSlug(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const slug = v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length === 0 ? null : slug;
}

function sanitizeString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0) return null;
  return t.length > max ? t.slice(0, max) : t;
}
