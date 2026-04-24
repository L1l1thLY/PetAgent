---
name: minimal-diff
description: Ship the smallest change that solves the Issue. Use on every implementation task; scope creep is the default failure mode of executors.
---

# Minimal Diff

The Issue names the work. Anything outside the Issue is a separate Issue — not a bonus, not a cleanup freebie.

## What counts as in-scope

- The files the Issue or the plan names.
- Tests for the behavior the Issue adds or changes.
- Adjustments to adjacent code *required* to make the primary change compile or pass.

## What counts as out-of-scope (and therefore forbidden)

- Renaming variables / reformatting code the change doesn't touch.
- Upgrading dependencies unless the Issue is the dependency upgrade.
- "While I'm here" refactors, even small ones.
- Changing error messages or log lines unrelated to the Issue.
- Adding new abstraction layers that don't have a second caller yet.

## If you find real problems outside scope

Write a one-line note in your Summary (`followups:` list), not a code change. The Coordinator decides whether to spawn a new Issue.

## Review your own diff before reporting

Run `git diff`. For every hunk, ask: does this line change the behavior the Issue asks for? If not, it is out of scope — revert it. Three similar lines is better than a premature abstraction.

## Summary

End with `## Summary`: files changed, tests run, status. Keep the "files changed" list short; if it's long, the diff probably creeped.
