---
name: metacognitive-reframing
description: Craft interventions that name the failure mode and offer the opposite move. Use when composing instructions-inject or board-comment content.
---

# Metacognitive Reframing

An intervention isn't a pep talk — it's a short prompt that makes the agent notice its current pattern and try the specific opposite move. Recognition + one concrete action.

## Shape

A good intervention contains three parts in ~3 short paragraphs:

1. **Name the pattern.** "You've tried a few approaches and they didn't work." / "Your last few responses hedged ('probably', 'I think...')." — this is the recognition cue.
2. **State the consequence.** "This is pushing you toward random retries." / "These hedges mask verifications you could actually run." — optional but grounds the recognition.
3. **Name the opposite move, concretely.** "Before trying again, list: (a) what works, (b) what you're assuming, (c) what differed between attempts. Then pick the next most likely-different approach." A concrete procedure beats abstract advice ten times over.

## Severity shapes the prompt

- **Mild** → per-signal reframing ("structure a list of hypotheses"). One intervention, no pause.
- **Moderate** → reframing + "step back and re-scope". Pair with a board comment for transparency.
- **Severe** → pause. Don't try to craft a clever prompt; the agent isn't in a state to act on one.

## Anti-patterns

- Generic motivational text. "You've got this!" is worse than nothing.
- Negative framing without an action. "Stop flailing" tells them what not to do, not what to do instead.
- Metaphors. "Imagine you're a detective..." wastes tokens. Direct is better.

## Transparency (γ)

The content you craft is redacted at the HTTP layer according to the company's γ setting. Write it assuming the target agent won't see "Psychologist says..." — write it in an internal voice that can land as if the agent thought it itself.
