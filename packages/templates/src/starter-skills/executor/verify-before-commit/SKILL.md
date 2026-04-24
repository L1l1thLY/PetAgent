---
name: verify-before-commit
description: Run build/test/lint and read the actual output before claiming done. Use on every implementation task, at the end.
---

# Verify Before Commit

"Looks right" is not verified. Before you write `## Summary` and hand off, run the checks and read the output — not paraphrase it.

## Required checks

1. **Build** — whatever the repo's build command is (e.g. `pnpm build`, `cargo build`). Any failure is automatic FAIL.
2. **Tests** — the test suite scoped to the packages you touched, then the full suite if time permits.
3. **Type check** (when separate from build) — e.g. `tsc --noEmit`.
4. **Lint** — if the repo has one.

For each: run the exact command, copy the actual output, note PASS/FAIL.

## Anti-patterns

- "The code looks correct" — reading is not running.
- "The tests I added pass" — run the full package, not just your tests. Other things may have broken.
- "Probably fine" — probably is not verified. Either run the check or explicitly declare it out of scope.
- Treating a warning as a pass. If the tool escalates it, treat it as a fail until understood.

## Failure protocol

If a check fails, fix it — do not commit and move on hoping someone else catches it. If the failure is outside your Issue's scope (pre-existing or caused by unrelated environment), note it explicitly in Summary under `environment:` and leave the Issue open until it's resolved or explicitly de-scoped.

## Summary line

Include `build=pass tests=pass lint=pass` (or the actual results) in your Summary so the Coordinator doesn't have to re-run them.
