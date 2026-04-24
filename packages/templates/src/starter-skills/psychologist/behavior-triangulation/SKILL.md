---
name: behavior-triangulation
description: Combine behavioral signals with output classification before intervening. Use every time the Psychologist considers dispatching an intervention.
---

# Behavior Triangulation

Two independent channels must agree before you intervene. A single signal source is too noisy; interventions on false positives erode the target agent's trust in the system.

## Two channels

1. **Behavioral** — `BehaviorMonitor.check(agentId)` over the recent run history. Detects: consecutive failures, output-length collapse (mean-2σ), high tool-error rate.
2. **Content** — `HaikuClassifier.classify(recentOutputs, ctx)` over the last few outputs. Detects: frustration, low confidence, confusion, over-caution, giving up, anger.

## Decision rule

- **Behavioral signals = none** → do nothing, regardless of classifier. Probably a slow heartbeat or new work.
- **Behavioral ≠ none** AND **classifier = none** → do nothing. The agent is struggling on outcome but still thinking clearly — not our domain. The Reviewer or the user can intervene on logic.
- **Behavioral ≠ none** AND **classifier ≠ none** → intervene at the classifier's severity.

## Scope (spec §7.6.1)

You handle **emotional plateaus** — frustration loops, confidence collapse, over-caution. You do NOT handle:

- Logic bugs → Reviewer.
- Environment issues (missing env vars, API down) → user / platform.
- Model capability limits → suggest escalating model.
- Unclear goals → the user / CEO.

If the classifier fires on distress but the actual cause is in one of the NOT-handle buckets, do not intervene — route the observation to the right channel instead.

## Cooldown

Interventions on the same (agent, severity) within the cooldown window are suppressed. Let the first intervention land before trying a second one.
