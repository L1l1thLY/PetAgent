---
name: issue-decomposition
description: Break a Company Goal into 3-10 atomic Issues. Use when a Goal arrives with no pre-existing plan and you need to produce a shippable work list.
---

# Issue Decomposition

A good Issue is one worker can own end-to-end in one sitting without blocking on side decisions.

## When an Issue is too big

- You cannot state success in one sentence.
- The work spans more than one worker class (e.g. needs both research and implementation).
- Completing it requires a decision you cannot make yourself.

When any of these trip, split it.

## Procedure

1. **Restate the Goal** in one sentence. If you can't, ask the user to clarify before decomposing.
2. **List the outputs** the Goal names or implies (files, deployments, docs, decisions).
3. **Draw dependencies** — which output must exist before another can start? Linear chains become serial Issues; independent branches become parallel Issues.
4. **Size each Issue** to one worker-class: read-only → Explorer, design → Planner, implementation → Executor, verification → Reviewer.
5. **Name the success criterion** per Issue in one sentence.

## Output

Finish with `## Dispatch Summary` listing each Issue's id, assigned worker, and its declared dependencies. The user should be able to read it and agree the breakdown is complete — no output that maps to the Goal is missing, no Issue has unclear scope.
