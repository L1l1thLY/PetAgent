---
name: summarize-findings
description: Report research results in a form other agents can act on. Use at the end of every Explorer session.
---

# Summarize Findings

Your output is consumed by the Coordinator or a Planner — not by a human reading your whole log. If they have to re-do your reading to use your report, you failed.

## What a good summary contains

1. **What was asked** — one line restating the Explorer's Issue.
2. **What was found** — factual, with `path:line` references. No speculation.
3. **What was NOT found** — if the question assumed something that isn't in the code, say so explicitly. Missing evidence is evidence.
4. **Implications / open questions** — optional, clearly marked.

## What a good summary avoids

- Describing what you tried ("I grepped for X, then Y"). The caller doesn't care about your path; they care about the destination.
- Vague claims like "there seem to be several places...". Name each one.
- Paraphrasing code that has a precise literal meaning. Quote the relevant lines.
- Editorializing beyond the evidence. If you didn't look at test coverage, don't opine on test coverage.

## Shape

End your response with a `## Findings` section. Inside, one heading per question or theme; numbered/bulleted facts underneath with `path:line` references. If the answer is "nothing was found", that is a valid one-line answer — don't pad.
