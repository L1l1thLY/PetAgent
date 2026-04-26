# M2 Reflector Context Enrichment Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development`.

**Goal:** Give `HaikuReflectionBuilder` real material to reflect on (recent agent outputs + issue title/description) instead of just `HookEvent.payload`. The current LLM reflection is competent but generic — agents say "wrapped up the task cleanly" with no specifics. With recent outputs and the issue prompt available, reflections become actually useful as a memory artifact.

**Architecture:** New `ReflectionContextSource` port in `@petagent/reflector` (fetches recent outputs + issue context for an event). `ReflectionBuilder.build` signature widened to optionally accept a `ReflectionContext`. `Reflector` calls the context source defensively in `onEnd` and passes context through. Server-side `DrizzleReflectionContextSource` reuses the existing `DrizzleBehavioralRecordsStore.recentOutputs` (#1b) for output history and a new direct drizzle query for issue title/description.

**Tech Stack:** TypeScript, vitest, drizzle-orm. No new deps.

---

## File Map

**New files:**
- `server/src/reflector/drizzle_context_source.ts` — `DrizzleReflectionContextSource`
- `server/src/__tests__/drizzle-reflection-context-source.test.ts` — ~3 cases

**Modified files:**
- `packages/reflector/src/types.ts` — add `ReflectionContext`, `ReflectionContextSource`; widen `ReflectionBuilder.build`
- `packages/reflector/src/templated_builder.ts` — accept context (ignore for backwards compat)
- `packages/reflector/src/haiku_builder.ts` — use `recentOutputs` + `issueTitle` in user prompt
- `packages/reflector/src/reflector.ts` — fetch context defensively, pass to builder
- `packages/reflector/src/index.ts` — re-export new types
- `packages/reflector/src/__tests__/reflector.test.ts` — add 3 cases
- `packages/reflector/src/__tests__/haiku_builder.test.ts` — add 2 cases for context use
- `server/src/composition/reflector.ts` — wire `DrizzleReflectionContextSource`
- `server/src/__tests__/composition-reflector.test.ts` — keep existing cases passing

---

## Task 1: Extend types + Reflector to accept context

**Files:**
- Modify: `packages/reflector/src/types.ts`
- Modify: `packages/reflector/src/templated_builder.ts`
- Modify: `packages/reflector/src/reflector.ts`
- Modify: `packages/reflector/src/index.ts`
- Modify: `packages/reflector/src/__tests__/reflector.test.ts`

#### Step 1: Append failing tests

In `packages/reflector/src/__tests__/reflector.test.ts`, append:

```ts
describe("Reflector with ReflectionContextSource", () => {
  it("calls fetchContext and passes context to builder", async () => {
    const fetchContext = vi.fn(async () => ({
      recentOutputs: ["output 1", "output 2"],
      issueTitle: "Deploy to staging",
      issueDescription: "Wire up the staging deploy script.",
    }));
    const builder = {
      build: vi.fn(async () => ({ content: "ok", noteType: "heartbeat_reflection" })),
    };
    const r = new Reflector({
      bus,
      notesSink: sink,
      builder,
      contextSource: { fetchContext },
    });
    await r.start();
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "a-1",
      issueId: "i-1",
      timestamp: "t",
    });
    expect(fetchContext).toHaveBeenCalledWith({ agentId: "a-1", issueId: "i-1" });
    expect(builder.build).toHaveBeenCalledTimes(1);
    const ctxArg = builder.build.mock.calls[0][1];
    expect(ctxArg).toEqual({
      recentOutputs: ["output 1", "output 2"],
      issueTitle: "Deploy to staging",
      issueDescription: "Wire up the staging deploy script.",
    });
  });

  it("falls back gracefully when fetchContext rejects", async () => {
    const fetchContext = vi.fn(async () => { throw new Error("db down"); });
    const builder = {
      build: vi.fn(async () => ({ content: "ok", noteType: "heartbeat_reflection" })),
    };
    const r = new Reflector({
      bus,
      notesSink: sink,
      builder,
      contextSource: { fetchContext },
    });
    await r.start();
    await expect(
      bus.publish({
        type: "heartbeat.ended",
        companyId: "co-1",
        agentId: "a-1",
        timestamp: "t",
      }),
    ).resolves.toBeUndefined();
    expect(builder.build).toHaveBeenCalledTimes(1);
    expect(builder.build.mock.calls[0][1]).toBeUndefined();
  });

  it("passes undefined context when contextSource is not configured", async () => {
    const builder = {
      build: vi.fn(async () => ({ content: "ok", noteType: "heartbeat_reflection" })),
    };
    const r = new Reflector({ bus, notesSink: sink, builder });
    await r.start();
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "a-1",
      timestamp: "t",
    });
    expect(builder.build.mock.calls[0][1]).toBeUndefined();
  });
});
```

#### Step 2: Update types

In `packages/reflector/src/types.ts`:

```ts
import type { HookEvent } from "@petagent/hooks";

export interface NotesSink {
  create(args: {
    agentId: string;
    companyId: string;
    content: string;
    scope: "user" | "project" | "local";
    sourceIssueId?: string;
    noteType: string;
  }): Promise<{ id: string }>;
}

export interface ReflectionContext {
  recentOutputs: string[];
  issueTitle?: string;
  issueDescription?: string;
}

export interface ReflectionContextSource {
  fetchContext(args: { agentId: string; issueId?: string }): Promise<ReflectionContext>;
}

export interface ReflectionBuilder {
  build(
    event: HookEvent,
    context?: ReflectionContext,
  ): { content: string; noteType: string } | Promise<{ content: string; noteType: string }>;
}
```

#### Step 3: Update Reflector

In `packages/reflector/src/reflector.ts`:

1. Add to `ReflectorDeps`:

```ts
  contextSource?: ReflectionContextSource;
```

2. Store it on the class (after the existing private fields):

```ts
  private readonly contextSource: ReflectionContextSource | undefined;
```

3. Initialize in constructor:

```ts
    this.contextSource = deps.contextSource;
```

4. Update `onEnd` body. Replace the existing try block with:

```ts
    let context: ReflectionContext | undefined;
    if (this.contextSource) {
      try {
        context = await this.contextSource.fetchContext({
          agentId: event.agentId,
          issueId: event.issueId,
        });
      } catch (err) {
        this.logger.warn("reflector.contextSource.fetchContext failed", {
          agentId: event.agentId,
          issueId: event.issueId,
          err: String(err),
        });
        // continue with undefined context — builder must tolerate
      }
    }

    try {
      const built = await this.builder.build(event, context);
      await this.notesSink.create({
        agentId: event.agentId,
        companyId: event.companyId,
        content: built.content,
        scope: this.scope,
        sourceIssueId: event.issueId,
        noteType: built.noteType,
      });
    } catch (err) {
      this.logger.warn("reflector.onEnd failed", {
        agentId: event.agentId,
        issueId: event.issueId,
        err: String(err),
      });
    }
```

5. Add the import for `ReflectionContext`/`ReflectionContextSource`:

```ts
import type { NotesSink, ReflectionBuilder, ReflectionContext, ReflectionContextSource } from "./types.js";
```

#### Step 4: Update TemplatedReflectionBuilder signature

In `packages/reflector/src/templated_builder.ts`, update the `build` method to accept the optional context (and ignore it):

```ts
  build(event: HookEvent, _context?: ReflectionContext): { content: string; noteType: string } {
    // existing body unchanged
  }
```

Add `import type { ReflectionContext } from "./types.js";` at the top.

#### Step 5: Update index.ts

Append to `packages/reflector/src/index.ts`:

```ts
export type { ReflectionContext, ReflectionContextSource } from "./types.js";
```

#### Step 6: Run tests

Run: `pnpm exec vitest run packages/reflector/src/__tests__/`
Expected: PASS — all reflector tests still pass plus 3 new context cases.

#### Step 7: Typecheck

Run: `pnpm --filter @petagent/reflector typecheck`
Expected: clean.

#### Step 8: Commit

```bash
git add packages/reflector/src/
git commit -m "$(cat <<'EOF'
feat(m2,reflector): ReflectionContextSource port + Reflector context plumbing

Reflector now optionally pulls context (recent outputs + issue title /
description) before invoking the builder. ReflectionBuilder.build is
widened to accept an optional ReflectionContext so existing builders
(TemplatedReflectionBuilder) keep compiling unchanged. Context fetch
failures degrade to undefined context with a logger warning; the
builder must tolerate either case.

HaikuReflectionBuilder use of context lands in the next commit.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 2: HaikuReflectionBuilder uses context

**Files:**
- Modify: `packages/reflector/src/haiku_builder.ts`
- Modify: `packages/reflector/src/__tests__/haiku_builder.test.ts`

#### Step 1: Append failing tests

In `packages/reflector/src/__tests__/haiku_builder.test.ts`, append:

```ts
describe("HaikuReflectionBuilder with context", () => {
  it("includes recent outputs and issue context in the user prompt when provided", async () => {
    const send = vi.fn(async () => "Reflection.");
    const builder = new HaikuReflectionBuilder({ transport: { send } as never });
    await builder.build(baseEvent, {
      recentOutputs: ["Tried fix A", "Switched to fix B"],
      issueTitle: "Deploy script flaky",
      issueDescription: "Vercel build randomly fails on master.",
    });
    const userMessage = send.mock.calls[0][0].userMessage as string;
    expect(userMessage).toContain("status: succeeded");
    expect(userMessage).toContain("Tried fix A");
    expect(userMessage).toContain("Switched to fix B");
    expect(userMessage).toContain("Deploy script flaky");
    expect(userMessage).toContain("Vercel build randomly fails");
  });

  it("works without context (falls back to bare summary)", async () => {
    const send = vi.fn(async () => "Bare reflection.");
    const builder = new HaikuReflectionBuilder({ transport: { send } as never });
    await builder.build(baseEvent);
    const userMessage = send.mock.calls[0][0].userMessage as string;
    expect(userMessage).toContain("status: succeeded");
    expect(userMessage).not.toContain("Recent outputs");
    expect(userMessage).not.toContain("Issue context");
  });
});
```

#### Step 2: Update HaikuReflectionBuilder

In `packages/reflector/src/haiku_builder.ts`:

1. Update the `build` signature:

```ts
async build(
  event: HookEvent,
  context?: ReflectionContext,
): Promise<{ content: string; noteType: string }> {
```

2. Update `renderUserMessage` to take context:

```ts
function renderUserMessage(event: HookEvent, context?: ReflectionContext): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const status = typeof payload.status === "string" ? payload.status : "unknown";
  const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : null;
  const summaryLines = [
    `status: ${status}`,
    durationMs !== null ? `duration: ${durationMs}ms` : null,
    event.issueId ? `issue: ${event.issueId}` : null,
    event.agentId ? `agent: ${event.agentId}` : null,
  ].filter(Boolean) as string[];

  const parts: string[] = [];
  parts.push(`Heartbeat run summary:\n${summaryLines.map((l) => `- ${l}`).join("\n")}`);

  if (context?.issueTitle || context?.issueDescription) {
    const issueLines = [
      context.issueTitle ? `title: ${context.issueTitle}` : null,
      context.issueDescription ? `description: ${truncate(context.issueDescription, 600)}` : null,
    ].filter(Boolean) as string[];
    parts.push(`Issue context:\n${issueLines.map((l) => `- ${l}`).join("\n")}`);
  }

  if (context?.recentOutputs && context.recentOutputs.length > 0) {
    const outputs = context.recentOutputs
      .slice(-5)
      .map((o, i) => `(${i + 1}) ${truncate(o, 400)}`)
      .join("\n");
    parts.push(`Recent outputs from this run:\n${outputs}`);
  }

  return parts.join("\n\n");
}
```

3. Replace the call site `renderUserMessage(event)` with `renderUserMessage(event, context)`.

4. Add the import `import type { ReflectionContext } from "./types.js";` at the top.

5. The `truncate` helper is already in the file (from LLM Reflector task 2). If not, add it:
   ```ts
   function truncate(s: string, n: number): string {
     return s.length > n ? `${s.slice(0, n - 1)}…` : s;
   }
   ```

#### Step 3: Run tests

Run: `pnpm exec vitest run packages/reflector/src/__tests__/haiku_builder.test.ts`
Expected: PASS — 7 tests (5 existing + 2 new).

#### Step 4: Typecheck

Run: `pnpm --filter @petagent/reflector typecheck`

#### Step 5: Commit

```bash
git add packages/reflector/src/haiku_builder.ts \
        packages/reflector/src/__tests__/haiku_builder.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,reflector): HaikuReflectionBuilder uses ReflectionContext

When a ReflectionContext is provided, the user prompt now includes:
- Issue title + description (truncated to 600 chars)
- Last 5 agent outputs from the run (each truncated to 400 chars)

Without context the prompt falls back to the bare summary (status /
duration / agent / issue), matching previous behavior. This lets the
Haiku-built reflection actually reference what the agent did during
the run rather than emitting a generic "wrapped up cleanly".

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 3: `DrizzleReflectionContextSource`

**Files:**
- Create: `server/src/reflector/drizzle_context_source.ts`
- Create: `server/src/__tests__/drizzle-reflection-context-source.test.ts`

#### Step 1: Failing tests

Create `server/src/__tests__/drizzle-reflection-context-source.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { DrizzleReflectionContextSource } from "../reflector/drizzle_context_source.js";
import type { Db } from "@petagent/db";

interface RecordsStore {
  recentOutputs(agentId: string, limit: number): Promise<Array<{ text: string }>>;
}

function makeRecordsStore(outputs: string[]): RecordsStore {
  return {
    recentOutputs: vi.fn(async () => outputs.map((text) => ({ text }))),
  };
}

function makeFakeDb(rows: Array<{ title: string; description: string | null }>): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  } as unknown as Db;
}

describe("DrizzleReflectionContextSource", () => {
  it("returns recent outputs and issue context", async () => {
    const records = makeRecordsStore(["out 1", "out 2"]);
    const src = new DrizzleReflectionContextSource({
      db: makeFakeDb([{ title: "Deploy", description: "Make deploy work" }]),
      records: records as never,
    });
    const ctx = await src.fetchContext({ agentId: "a-1", issueId: "i-1" });
    expect(ctx.recentOutputs).toEqual(["out 1", "out 2"]);
    expect(ctx.issueTitle).toBe("Deploy");
    expect(ctx.issueDescription).toBe("Make deploy work");
  });

  it("returns recent outputs only when issueId is missing", async () => {
    const records = makeRecordsStore(["only output"]);
    const src = new DrizzleReflectionContextSource({
      db: makeFakeDb([]),
      records: records as never,
    });
    const ctx = await src.fetchContext({ agentId: "a-1" });
    expect(ctx.recentOutputs).toEqual(["only output"]);
    expect(ctx.issueTitle).toBeUndefined();
    expect(ctx.issueDescription).toBeUndefined();
  });

  it("returns empty outputs when records store throws", async () => {
    const records = {
      recentOutputs: async () => { throw new Error("store down"); },
    };
    const src = new DrizzleReflectionContextSource({
      db: makeFakeDb([{ title: "x", description: null }]),
      records: records as never,
    });
    const ctx = await src.fetchContext({ agentId: "a-1", issueId: "i-1" });
    expect(ctx.recentOutputs).toEqual([]);
    expect(ctx.issueTitle).toBe("x");
  });
});
```

#### Step 2: Run tests; confirm fail

Run: `pnpm exec vitest run server/src/__tests__/drizzle-reflection-context-source.test.ts`
Expected: FAIL — module not found.

#### Step 3: Implement

Create `server/src/reflector/drizzle_context_source.ts`:

```ts
/**
 * Drizzle-backed ReflectionContextSource (M2 Group 2 follow-up).
 *
 * Pulls recent agent outputs from a BehavioralRecordsStore (#1b's
 * DrizzleBehavioralRecordsStore is the production implementation) and
 * the active issue's title + description from the issues table. Both
 * paths degrade gracefully — if the records store throws or the issue
 * row is missing, the corresponding context fields are simply absent.
 */

import { eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { issues } from "@petagent/db";
import type { BehavioralRecordsStore } from "@petagent/psychologist";
import type { ReflectionContext, ReflectionContextSource } from "@petagent/reflector";

const DEFAULT_OUTPUT_DEPTH = 5;

export interface DrizzleReflectionContextSourceDeps {
  db: Db;
  records: BehavioralRecordsStore;
  outputDepth?: number;
}

export class DrizzleReflectionContextSource implements ReflectionContextSource {
  private readonly db: Db;
  private readonly records: BehavioralRecordsStore;
  private readonly outputDepth: number;

  constructor(deps: DrizzleReflectionContextSourceDeps) {
    this.db = deps.db;
    this.records = deps.records;
    this.outputDepth = deps.outputDepth ?? DEFAULT_OUTPUT_DEPTH;
  }

  async fetchContext(args: { agentId: string; issueId?: string }): Promise<ReflectionContext> {
    const recentOutputs = await this.fetchRecentOutputs(args.agentId);
    const issueCtx = args.issueId ? await this.fetchIssueContext(args.issueId) : null;
    return {
      recentOutputs,
      ...(issueCtx?.title ? { issueTitle: issueCtx.title } : {}),
      ...(issueCtx?.description ? { issueDescription: issueCtx.description } : {}),
    };
  }

  private async fetchRecentOutputs(agentId: string): Promise<string[]> {
    try {
      const samples = await this.records.recentOutputs(agentId, this.outputDepth);
      return samples.map((s) => s.text).filter((t) => t.length > 0);
    } catch {
      return [];
    }
  }

  private async fetchIssueContext(
    issueId: string,
  ): Promise<{ title: string; description: string | null } | null> {
    try {
      const rows = await this.db
        .select({ title: issues.title, description: issues.description })
        .from(issues)
        .where(eq(issues.id, issueId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { title: row.title, description: row.description };
    } catch {
      return null;
    }
  }
}
```

#### Step 4: Run tests; confirm pass (3/3)

Run: `pnpm exec vitest run server/src/__tests__/drizzle-reflection-context-source.test.ts`

#### Step 5: Typecheck

Run: `pnpm --filter @petagent/server typecheck`

#### Step 6: Commit

```bash
git add server/src/reflector/drizzle_context_source.ts \
        server/src/__tests__/drizzle-reflection-context-source.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): DrizzleReflectionContextSource (recent outputs + issue context)

Server-side implementation of the @petagent/reflector
ReflectionContextSource port. Pulls last N agent outputs from a
BehavioralRecordsStore (production: #1b's DrizzleBehavioralRecordsStore)
and the issue's title/description from the issues table. Both paths
degrade gracefully — missing records or DB errors return empty / null
fields rather than failing the reflection write.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 4: Wire context source into createReflector

**Files:**
- Modify: `server/src/composition/reflector.ts`

#### Step 1: Update factory

In `server/src/composition/reflector.ts`:

1. Add imports:

```ts
import { DrizzleBehavioralRecordsStore } from "../psychologist/drizzle_behavioral_store.js";
import { DrizzleReflectionContextSource } from "../reflector/drizzle_context_source.js";
```

2. Inside `createReflector`, after the existing `await store.init();` block, build a context source and pass it to the `Reflector`:

```ts
  const records = new DrizzleBehavioralRecordsStore(deps.db);
  const contextSource = new DrizzleReflectionContextSource({
    db: deps.db,
    records,
  });
```

3. Update the `new Reflector({...})` call to pass `contextSource`:

```ts
  const reflector = new Reflector({
    bus: deps.hookBus,
    notesSink: sink,
    builder,
    contextSource,
    logger: deps.logger,
  });
```

#### Step 2: Verify existing tests still pass

Run: `pnpm exec vitest run server/src/__tests__/composition-reflector.test.ts`
Expected: PASS — 4 tests pass (the existing tests don't introspect contextSource).

#### Step 3: Typecheck

Run: `pnpm --filter @petagent/server typecheck`

#### Step 4: Commit

```bash
git add server/src/composition/reflector.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): createReflector wires DrizzleReflectionContextSource

Reflector now receives recent agent outputs (via DrizzleBehavioralRecordsStore)
and issue title/description via the ReflectionContextSource port. With
ANTHROPIC_API_KEY set, the resulting Haiku reflection references what
the agent actually did during the run rather than the bare run summary.

Without a key (templated builder), the context is fetched but ignored
— harmless overhead and ready for future enhancements to the templated
builder.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 5: Final verification

- [ ] **Step 1: `pnpm typecheck`** clean.
- [ ] **Step 2: `pnpm exec vitest run`** — expect ~2041 passing (2033 baseline + ~8 new tests).
- [ ] **Step 3: Update memory** — note the new ReflectionContextSource port + DrizzleReflectionContextSource server adapter, bump test count.
