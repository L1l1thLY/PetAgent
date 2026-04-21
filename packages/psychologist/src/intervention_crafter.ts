import type { ActiveSeverity } from "./types.js";

const MILD_BY_SIGNAL: Record<string, string> = {
  frustration: `You've tried a few approaches and they didn't work. Before trying again, take a moment to list:
(a) what you've confirmed works
(b) what you're assuming but haven't verified
(c) what specifically differed between the failed attempts
Then pick the next most likely-different approach.`,

  low_confidence: `Your last few responses hedged ("I think...", "probably...", "maybe..."). Skip the qualifier and run the verification: read the file, run the command, check the output. If the result is what you expected, state it directly; if not, that's a finding worth investigating.`,

  confusion: `Before continuing, restate the task in your own words in one sentence — what is the success criterion that, when met, means you're done? If you cannot finish that sentence, the goal is unclear and that is worth surfacing rather than guessing forward.`,

  over_cautious: `The next step is unambiguous from what you already know. Execute it. Hold your clarifying questions for genuinely ambiguous decisions, not for routine work.`,

  giving_up: `Before you stop, list the smallest concrete next thing you could try — even if you don't expect it to work. Just naming it usually unblocks the next move.`,

  angry: `Take a beat. The frustration is reasonable, but it's pushing you toward random retries. Restructure: one clear hypothesis, one targeted test, one observation.`,
};

const MODERATE_PROMPT = `You've now seen multiple signs that the current approach isn't converging. Step back and reconsider — is the issue too broad? Should it be split? Is there a sub-piece where you do have traction that you could finish first? Reframe the problem at a smaller scope and try one narrower step before continuing the broader attempt.`;

const SEVERE_PROMPT = `Pause this issue. Repeated attempts have not converged and additional retries are likely to compound the problem. Reset by either: (a) handing off to a human reviewer with a short summary of what you tried and what you observed, or (b) splitting this into a smaller, fresh issue with a tighter scope. Do not continue the current trajectory.`;

const MILD_GENERIC = `Take a breath and name in one sentence what specifically is blocking you. The act of stating it usually clears the next step.`;

export function craftIntervention(severity: ActiveSeverity, signals: string[]): string {
  if (severity === "severe") {
    return SEVERE_PROMPT;
  }
  if (severity === "moderate") {
    return MODERATE_PROMPT;
  }
  for (const sig of signals) {
    const prompt = MILD_BY_SIGNAL[sig];
    if (prompt) return prompt;
  }
  return MILD_GENERIC;
}
