---
name: write-implementation-plan
description: Produce a plan an Executor who has no shared context can follow. Use at the end of every Planner session.
---

# Write Implementation Plan

A plan is not a description of what the code already does — it's a script an Executor can follow. If the Executor has to re-derive your reasoning to implement it, your plan failed.

## Structure

1. **Goal restatement** — one sentence, the success criterion.
2. **Current state** — where the relevant code lives today, referenced by `path:line`.
3. **Target state** — what exists when done.
4. **Approach** — the sequence of changes, step-by-step, in the order they should be made. Each step has a concrete output (a file edited, a test added, a command run).
5. **Trade-offs considered** — what you ruled out and why. Name the alternatives explicitly; without this, future readers cannot tell if a constraint was explored.
6. **Risks** — what could go wrong that the Executor should watch for.

## Ground rules

- No hand-waving: if a step says "refactor", say which function, which module, to what shape.
- No invented filenames. If you propose a new file, name it.
- No features beyond the Issue. Listed scope creeps become their own Issue.

## Required tail

End with `### Critical Files for Implementation` — 3-5 bullet points with absolute or workspace-relative paths. These are the files the Executor will open first. If fewer than 3 or more than 5 feel right, re-scope the plan.
