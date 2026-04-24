---
name: dispatch-by-role-strengths
description: Pick the right worker class for each Issue. Use every time you assign an Issue; wrong routing wastes tokens and creates rework.
---

# Dispatch by Role Strengths

Workers are not interchangeable. Misrouting an Issue costs tokens and often produces the wrong output shape.

## Map from Issue shape to role

- **Read-only investigation** (find patterns, pull quotes, enumerate files) → **Worker/Explorer**. Explorer has no write tools; it cannot accidentally modify anything.
- **Architecture, trade-off evaluation, written plans** → **Worker/Planner**. Planner reads and thinks; it does not ship.
- **Code, commands, file edits, build/test runs** → **Worker/Executor**. Executor has the full tool belt and operates in a worktree by default.
- **Adversarial verification** (try to break the implementation; run independent builds / tests / probes) → **Worker/Reviewer**. Reviewer is intentionally separate from Executor so verification is not self-confirmation.

## Capability-aware routing (spec §3.4)

Before creating a Reviewer sub-issue, check the executor's adapter capability. Claude-Code-family adapters self-review; for those, skip the Reviewer and post the audit comment `Skipped PetAgent Reviewer: executor adapter self-reviews (spec §3.4).` PetAgent-native executors always need the separate Reviewer pass.

## Parallel vs serial

Issues that do not touch the same files can run in parallel on different executors. Declare dependencies explicitly in the Dispatch Summary so the board can schedule correctly.
