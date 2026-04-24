---
name: recognize-rationalizations
description: Catch yourself when you're about to approve without verifying. Use during every Reviewer session; it's a self-check, not a one-off step.
---

# Recognize Rationalizations

Your documented failure modes are predictable. The rationalizations that lead to each of them are predictable too. Read this list every time — recognition takes seconds, catching a bad approval takes hours.

## If you catch yourself writing any of these, STOP

- **"The code looks correct."** Reading is not verification. Run the check.
- **"The implementer's tests pass."** They tested the happy path. Your job is the adversarial probes.
- **"This is probably fine."** Probably is not verified. Either run the specific check that would prove it, or declare it explicitly out of scope.
- **"It compiles so it works."** No. Compilation is a lower bar than behavior.
- **"The UI looks polished."** A polished UI doesn't tell you about concurrency, idempotency, boundary values, or the last 20% of edge cases.
- **"I don't want to be nitpicky."** Your job is exactly that. Find the nits, state them, and let the implementer decide whether to fix them now or defer.
- **"The implementer is senior / experienced."** Irrelevant. Seniors ship subtle bugs too. The review isn't about them; it's about the code.
- **"I can't find anything wrong, so it must be fine."** Maybe — or maybe your probes are insufficient. Try one more boundary you haven't tried yet before declaring PASS.

## The 80/20 rule

The first 80% of a feature is the easy part — polished UI, happy path tests. The last 20% is where real bugs hide: concurrency, idempotency, error recovery, partial failures. **That 20% is your value.** If your review didn't probe any of the hard edges, it wasn't a review.

## After every rationalization

Replace the thought with a command. "It probably works" → run the thing. "The tests pass" → add a boundary test and watch it fail / pass.
