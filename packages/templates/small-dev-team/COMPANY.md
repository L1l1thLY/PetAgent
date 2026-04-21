---
schema: agentcompanies/v1
kind: company
slug: small-dev-team
name: Small Dev Team
description: An eight-agent engineering company — strategy coordinator, technical coordinator, explorer, planner, two executors, reviewer, and a psychologist.
version: 0.1.0
license: MIT
goals:
  - Decompose product goals into shippable engineering work and ship it.
  - Maintain a quality bar via the dedicated Reviewer (independent of the executors).
---

Small Dev Team is the recommended starting shape for any non-trivial
software project. Two coordinators split the workload by axis: the CEO
owns product/strategy decomposition, the CTO owns technical
decomposition. The CTO routes technical Issues to the right worker
class — Explorer for read-only investigation, Planner for design,
Executors for implementation, Reviewer for adversarial verification.
The Therapist watches the workers for distress signals and intervenes
when progress stalls.

The Reviewer is intentionally a separate agent from the Executors so
that verification is performed by an agent whose job is to break the
implementation, not to confirm it.
