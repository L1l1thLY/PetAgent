---
name: write-failing-test-first
description: Start implementation with a red test. Use on any bugfix or new behavior — not on refactors or style changes.
---

# Write Failing Test First

Writing the test before the code is not a performance — it's a forcing function for two things: (a) proving the symptom before you chase a fix, (b) giving yourself a concrete "done" signal you cannot fake.

## When to use it

- **Yes**: bugfix (write the test that reproduces it), new behavior (write the test for the behavior you're adding), edge case discovered mid-work (pin it now so the fix doesn't regress it later).
- **No**: pure refactor (existing tests stay green by definition), cosmetic / docs change, time-critical hotfix where you'll add the test immediately after.

## Procedure

1. **Write the test.** Name it after the behavior, not the code path.
2. **Run it. Confirm red.** A green test at this point means your test is wrong, not that the behavior already works.
3. **Read the failure.** Does it fail for the right reason (missing behavior) or the wrong reason (setup error, typo)? Fix the test until it fails for the right reason.
4. **Implement. Run. Confirm green.**
5. **Run the full suite.** If other tests broke, you changed behavior they depended on — investigate.

## Anti-patterns

- Writing a test that passes immediately because it asserts something already true.
- Testing implementation details that will break on any refactor.
- Committing the implementation without also committing the test.
