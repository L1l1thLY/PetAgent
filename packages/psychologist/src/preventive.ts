import type { IncidentStore } from "./types.js";

const DEFAULT_SINCE_DAYS = 30;
const TOP_K = 3;

const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  frustration:
    "Frustration loops: when you fail twice or more, you start trying increasingly random things. Recognize: when you notice yourself picking approaches without clear reasoning, stop and structure a list of hypotheses instead.",
  low_confidence:
    "Low confidence: you pre-emptively qualify your answers (\"I think...\", \"probably...\", \"maybe...\"). Recognize: when you catch a hedge, replace it with a verification — read the file, run the command, then state the result directly.",
  confusion:
    "Confusion: you continue acting before the goal is clear. Recognize: when you cannot restate the success criterion in one sentence, stop and ask for clarification rather than guessing forward.",
  over_cautious:
    "Over-cautiousness: you ask clarifying questions on tasks that are already unambiguous. Recognize: if the next step is clear from what you already know, execute; reserve clarifying questions for genuinely ambiguous decisions.",
  giving_up:
    "Giving up: you declare a task impossible before naming the smallest concrete next thing to try. Recognize: before stopping, list one specific next action — even one you doubt will work — and try it.",
  angry:
    "Anger: frustration is pushing you toward random retries. Recognize: take a beat, then restructure as one clear hypothesis, one targeted test, one observation.",
};

export function describeSignal(signal: string): string {
  const known = SIGNAL_DESCRIPTIONS[signal];
  if (known) return known;
  return `Signal "${signal}" has been observed frequently. Recognize when the pattern reappears and consciously do the opposite.`;
}

export interface PreventiveOptions {
  sinceDays?: number;
  topK?: number;
}

export async function getPreventiveSuffix(
  agentId: string,
  incidents: IncidentStore,
  opts: PreventiveOptions = {},
): Promise<string | null> {
  const sinceDays = opts.sinceDays ?? DEFAULT_SINCE_DAYS;
  const topK = opts.topK ?? TOP_K;
  const top = await incidents.topSignalsForAgent(agentId, sinceDays);
  const filtered = top.filter((t) => t.count > 0).slice(0, topK);
  if (filtered.length === 0) return null;

  const lines = filtered.map((entry, idx) => {
    return `${idx + 1}. ${describeSignal(entry.signal)}`;
  });

  return [
    "",
    "## Your Documented Failure Modes",
    "",
    "You have historically-observed patterns. Recognize them and consciously do the opposite:",
    "",
    ...lines,
  ].join("\n");
}
