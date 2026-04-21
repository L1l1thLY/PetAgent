---
schema: agentcompanies/v1
kind: company
slug: hybrid-team
name: Hybrid Team
description: PetAgent coordinator + planner + reviewer + psychologist plus two external Claude Code executors with double-review semantics.
version: 0.1.0
license: MIT
goals:
  - Combine PetAgent governance (coordinator + planner + adversarial reviewer + psychologist) with the implementation throughput of two external Claude Code executors.
---

Hybrid Team is the recommended shape when you want PetAgent's
governance and safety properties (a separate Reviewer that probes
work adversarially, a Psychologist sidecar) but want to run actual
implementation in external `claude_local` adapters — for example
because Claude Code is already the team's primary development tool.

## Double-review semantics

The two `claude_local` executors mark themselves as
`selfReviewsImplementation: true` in `.petagent.yaml`. Claude Code
performs a self-review before completing each Issue, but the PetAgent
Reviewer-1 still audits the result independently. The two reviews
serve different purposes:

- Claude Code's self-review catches its own mistakes and surfaces
  what it could not finish.
- The PetAgent Reviewer's job is to **break** the implementation —
  run boundary probes, concurrency checks, idempotency tests — not
  to confirm Claude Code's claims.

Reviewer-1 should never be skipped on the basis that Claude Code
already self-reviewed. The Coordinator's responsibility is to honor
the dispatch order: Executor → Reviewer → close.
