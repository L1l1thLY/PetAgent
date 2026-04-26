/**
 * Prompt builder for the weekly skill-mining LLM call (M2 G4 §5.2).
 *
 * The system prompt instructs the model to find recurring patterns
 * (≥ frequencyThreshold occurrences across distinct notes) and propose
 * Skill candidates as a JSON array. The user message embeds the notes.
 *
 * Notes are rendered as a numbered list with id + agent + type + body
 * so the model can refer to them by id in `sourceNoteIds`.
 */

import type { MineWindow, NoteSummary } from "./types.js";

const MAX_NOTE_BODY_CHARS = 1500;

export function buildSystemPrompt(opts: {
  frequencyThreshold: number;
  maxCandidates: number;
}): string {
  return `You are reviewing notes written by AI agents after completing tasks. Your job is to identify RECURRING PATTERNS — concrete techniques, error-handling tactics, or domain procedures that appear across multiple distinct notes — and propose them as reusable Skills.

Rules:
- A pattern qualifies only if it appears in AT LEAST ${opts.frequencyThreshold} distinct notes.
- Propose at most ${opts.maxCandidates} candidates. Prioritise the highest-frequency, highest-utility patterns.
- A Skill body must be self-contained: assume the future agent has none of the original context.
- Never invent details that aren't visibly supported by the source notes.
- Return ONLY a JSON array — no prose before or after, no markdown fences.

Schema for each candidate:
{
  "name": <slug, kebab-case, ≤ 40 chars, e.g. "handle-stripe-webhook-replay">,
  "title": <one-line human-readable title, ≤ 80 chars>,
  "body": <markdown skill body, 100-400 words, concrete reusable steps>,
  "rationale": <1-2 sentences: why this pattern is worth saving>,
  "sourceNoteIds": <array of note ids that exhibit the pattern>,
  "patternFrequency": <integer count, must equal sourceNoteIds.length>,
  "agentId": <single agent id when all source notes share one agent; null otherwise>
}

If no patterns meet the ${opts.frequencyThreshold}-occurrence threshold, return [].`;
}

export function buildUserMessage(opts: {
  companyId: string;
  window: MineWindow;
  notes: NoteSummary[];
}): string {
  const header = `Company: ${opts.companyId}\nMining window: ${formatDate(opts.window.start)} → ${formatDate(opts.window.end)}\nTotal notes: ${opts.notes.length}\n\nNotes:\n`;

  const rendered = opts.notes
    .map((n, i) => {
      const body = truncate(n.body, MAX_NOTE_BODY_CHARS);
      const tags = n.tags && n.tags.length > 0 ? ` tags=${n.tags.join(",")}` : "";
      return `--- note #${i + 1}\nid: ${n.id}\nagent: ${n.agentId}\ntype: ${n.noteType}${tags}\nbody:\n${body}`;
    })
    .join("\n\n");

  return header + rendered + "\n\nReturn the JSON array now:";
}

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toISOString().slice(0, 10);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 4) + " …";
}
