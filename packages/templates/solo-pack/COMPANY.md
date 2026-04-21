---
schema: agentcompanies/v1
kind: company
slug: solo-pack
name: Solo Pack
description: The minimum viable PetAgent — one coordinator, one executor, one psychologist sidecar.
version: 0.1.0
license: MIT
goals:
  - Get one user-facing thing shipped end-to-end with the smallest possible team.
---

Solo Pack is the lightest PetAgent starter. The Coordinator decomposes
goals and routes Issues. The Executor does the actual work in a
worktree. The Therapist (Psychologist) watches both for distress
signals and intervenes when progress stalls.

Use Solo Pack when you want to evaluate PetAgent end-to-end without
the overhead of a full org chart, or when a single-coordinator pattern
is the right shape for your workload.
