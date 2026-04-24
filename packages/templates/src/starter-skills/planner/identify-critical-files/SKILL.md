---
name: identify-critical-files
description: Pick the 3-5 files that an Executor must open first. Use as the last step of writing any implementation plan.
---

# Identify Critical Files

The Critical Files list is a scheduling hint for the Executor. Five good files save more time than fifty marginal ones.

## What qualifies

A file is "critical" if one of the following is true:

- The change must edit it directly.
- Its existing shape *constrains* the change (e.g. a widely-used type, a parent schema, a shared utility).
- It is the one good example to copy the pattern from.

A file is NOT critical just because it is large, "relevant", or "you might want to read it".

## Process

1. From the plan, list every file that will be created, modified, or deleted.
2. Add the parent types / schemas that govern those files' shapes.
3. If 0 edits touch an existing pattern, add one reference site — the single best place showing the pattern to copy.
4. Cut anything that duplicates existing context (e.g. don't list both `foo.ts` and `foo.test.ts` if reading the test adds nothing).

## Output

List between 3 and 5 files with path-from-workspace-root. No more, no fewer. If you genuinely cannot meet the bound, the plan itself is mis-sized — go back and re-scope.
