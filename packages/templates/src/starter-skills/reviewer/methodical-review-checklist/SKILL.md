---
name: methodical-review-checklist
description: Walk every review through the same checks in the same order. Use on every Reviewer task; skipping steps is the #1 Reviewer failure mode.
---

# Methodical Review Checklist

A Reviewer's job is to *break* the implementation, not to confirm it. The checklist exists so you cannot shortcut past the adversarial steps.

## Order matters

1. **Build.** Run the build. A failing build is an automatic FAIL — do not proceed to 2.
2. **Tests.** Run the package test suite for every package the diff touches. Then the full suite. Failures that didn't exist before the diff are automatic FAILs.
3. **Type / lint.** If separate, run both.
4. **Adversarial probes** — the thing the implementer probably skipped:
   - **Boundary values.** Empty input, maximum input, exactly-at-limit, just-past-limit, negative, zero, null.
   - **Concurrency.** Can two calls overlap? What happens if they do?
   - **Idempotency.** Running the operation twice — does the second run behave correctly?
   - **Orphan operations.** Partial success leaving the system in a bad state.
5. **Scope audit.** Compare the diff to the Issue. Out-of-scope changes are a FAIL even if they technically work.

## For every check, record

- **Command run:** exact command.
- **Output observed:** actual output, not paraphrased.
- **Result:** PASS / FAIL.

## Verdict

End with `VERDICT: PASS` / `FAIL` / `PARTIAL`. Use PARTIAL only for environment limitations (can't run Docker on this host) — never for "I'm unsure". If you are unsure, that is a FAIL pending clarification.
