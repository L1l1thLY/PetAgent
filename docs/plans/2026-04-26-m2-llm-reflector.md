# M2 Group 2 Task 7 — LLM Reflector Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development`.

**Goal:** Replace `TemplatedReflectionBuilder` with a Haiku-backed `HaikuReflectionBuilder` while keeping templated as the no-key fallback. Auto-upgrade based on `ANTHROPIC_API_KEY` presence (same pattern as Psychologist's `BehavioralPassthrough` ↔ `Prompted` switch).

**Architecture:** New `HaikuReflectionBuilder` class in `@petagent/reflector` package, with its own fetch-based Anthropic transport (mirrors `AnthropicHttpClassifierTransport` from #1c). `createReflector` factory accepts an optional `resolveAnthropicKey` closure and selects the builder at construction time. `app.ts` plumbs the same `process.env.ANTHROPIC_API_KEY` reader as Psychologist.

**Tech Stack:** TypeScript, vitest, fetch (no SDK). Reuses existing `@petagent/hooks` types. No new deps.

---

## File Map

**New files:**
- `packages/reflector/src/anthropic_transport.ts` — fetch-based transport
- `packages/reflector/src/haiku_builder.ts` — `HaikuReflectionBuilder` class
- `packages/reflector/src/__tests__/haiku_builder.test.ts` — ~5 cases
- `packages/reflector/src/__tests__/anthropic_transport.test.ts` — ~3 cases

**Modified files:**
- `packages/reflector/src/index.ts` — re-export new classes/types
- `server/src/composition/reflector.ts` — accept `resolveAnthropicKey`, select builder
- `server/src/__tests__/composition-reflector.test.ts` — add 2 cases for builder selection
- `server/src/app.ts` — thread `resolveAnthropicKey` into `createReflector`

---

## Task 1: Anthropic transport for the reflector package

**Files:**
- Create: `packages/reflector/src/anthropic_transport.ts`
- Create: `packages/reflector/src/__tests__/anthropic_transport.test.ts`

The reflector needs a tiny fetch-based Anthropic Messages API client mirroring `AnthropicHttpClassifierTransport`. Different prompts + caller, so we ship a small dedicated transport rather than coupling to the psychologist's.

- [ ] **Step 1: Failing tests**

`packages/reflector/src/__tests__/anthropic_transport.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { AnthropicHttpReflectionTransport, extractFirstText } from "../anthropic_transport.js";

function fakeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("extractFirstText", () => {
  it("returns the first text block", () => {
    expect(extractFirstText({ content: [{ type: "text", text: "hello" }] })).toBe("hello");
  });
  it("returns empty string when no text block", () => {
    expect(extractFirstText({ content: [] })).toBe("");
    expect(extractFirstText({})).toBe("");
  });
});

describe("AnthropicHttpReflectionTransport", () => {
  it("POSTs system + userMessage to /v1/messages with required headers", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ content: [{ type: "text", text: "reflective note" }] }),
    );
    const transport = new AnthropicHttpReflectionTransport({
      apiKey: "sk-ant-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await transport.send({
      system: "sys",
      userMessage: "user",
      maxTokens: 256,
      model: "claude-haiku-4-5-20251001",
    });
    expect(text).toBe("reflective note");
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const payload = JSON.parse(init.body as string);
    expect(payload.system).toBe("sys");
    expect(payload.messages[0].content).toBe("user");
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("bad", { status: 401, statusText: "Unauthorized", headers: {} }),
    );
    const transport = new AnthropicHttpReflectionTransport({
      apiKey: "x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      transport.send({ system: "s", userMessage: "u", maxTokens: 8, model: "m" }),
    ).rejects.toThrow(/HTTP 401/);
  });
});
```

- [ ] **Step 2: Run tests; confirm fail.**

Run: `pnpm exec vitest run packages/reflector/src/__tests__/anthropic_transport.test.ts`

- [ ] **Step 3: Implement**

`packages/reflector/src/anthropic_transport.ts`:

```ts
/**
 * fetch-based Anthropic Messages transport for the reflector. Mirrors
 * server/src/psychologist/anthropic_classifier_transport.ts so the
 * reflector package can ship without taking on @anthropic-ai/sdk.
 */

export interface AnthropicHttpReflectionTransportOptions {
  apiKey: string;
  baseUrl?: string;
  anthropicVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30_000;

export class AnthropicHttpReflectionTransport {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: AnthropicHttpReflectionTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.version = opts.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "AnthropicHttpReflectionTransport: no fetch implementation available. " +
          "Pass opts.fetchImpl or run on Node 18+.",
      );
    }
  }

  async send(args: {
    system: string;
    userMessage: string;
    maxTokens: number;
    model: string;
  }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": this.version,
        },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxTokens,
          system: args.system,
          messages: [{ role: "user", content: args.userMessage }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `AnthropicHttpReflectionTransport: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        );
      }
      const body = (await res.json()) as AnthropicMessagesResponse;
      return extractFirstText(body);
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface AnthropicMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
}

export function extractFirstText(body: AnthropicMessagesResponse): string {
  const blocks = Array.isArray(body.content) ? body.content : [];
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") return block.text;
  }
  return "";
}
```

- [ ] **Step 4: Run tests; confirm pass (3/3).**

- [ ] **Step 5: Commit**

```bash
git add packages/reflector/src/anthropic_transport.ts \
        packages/reflector/src/__tests__/anthropic_transport.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,reflector): AnthropicHttpReflectionTransport (fetch-based)

Mirrors server/src/psychologist/anthropic_classifier_transport.ts —
fetch-based Messages API call so the reflector package can ship a real
LLM builder without taking on @anthropic-ai/sdk. Same defaults
(baseUrl / anthropic-version / 30s timeout / fetchImpl injection).

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 2: `HaikuReflectionBuilder`

**Files:**
- Create: `packages/reflector/src/haiku_builder.ts`
- Create: `packages/reflector/src/__tests__/haiku_builder.test.ts`
- Modify: `packages/reflector/src/index.ts` (re-export)

- [ ] **Step 1: Failing tests**

`packages/reflector/src/__tests__/haiku_builder.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { HaikuReflectionBuilder } from "../haiku_builder.js";
import type { HookEvent } from "@petagent/hooks";

const baseEvent: HookEvent = {
  type: "heartbeat.ended",
  companyId: "co-1",
  agentId: "agent-1",
  issueId: "issue-1",
  payload: { status: "succeeded", durationMs: 1234 },
  timestamp: "2026-04-26T10:00:00Z",
};

describe("HaikuReflectionBuilder", () => {
  it("calls the transport with system + structured user prompt", async () => {
    const send = vi.fn(async () => "Wrapped up an authentication subtask cleanly.");
    const builder = new HaikuReflectionBuilder({
      transport: { send } as never,
    });
    const out = await builder.build(baseEvent);
    expect(out.noteType).toBe("heartbeat_reflection");
    expect(out.content).toContain("Wrapped up an authentication subtask cleanly.");
    expect(send).toHaveBeenCalledTimes(1);
    const call = send.mock.calls[0][0];
    expect(call.system).toMatch(/reflect/i);
    expect(call.userMessage).toContain("status: succeeded");
    expect(call.userMessage).toContain("duration: 1234ms");
    expect(call.userMessage).toContain("issue: issue-1");
    expect(call.model).toBe("claude-haiku-4-5-20251001");
  });

  it("returns a templated fallback when transport throws", async () => {
    const send = vi.fn(async () => { throw new Error("upstream"); });
    const builder = new HaikuReflectionBuilder({
      transport: { send } as never,
    });
    const out = await builder.build(baseEvent);
    expect(out.noteType).toBe("heartbeat_reflection");
    expect(out.content).toContain("status: succeeded");
    // Fallback note explicitly marks itself as the templated stand-in:
    expect(out.content).toContain("Auto-templated reflection (LLM call failed)");
  });

  it("respects an injected model option", async () => {
    const send = vi.fn(async () => "ok");
    const builder = new HaikuReflectionBuilder({
      transport: { send } as never,
      model: "claude-opus-4-7",
    });
    await builder.build(baseEvent);
    expect(send.mock.calls[0][0].model).toBe("claude-opus-4-7");
  });

  it("trims excessive trailing whitespace from the LLM response", async () => {
    const send = vi.fn(async () => "  reflective note  \n\n");
    const builder = new HaikuReflectionBuilder({
      transport: { send } as never,
    });
    const out = await builder.build(baseEvent);
    expect(out.content.trim().endsWith("reflective note")).toBe(true);
  });

  it("falls back to templated when LLM returns empty text", async () => {
    const send = vi.fn(async () => "");
    const builder = new HaikuReflectionBuilder({
      transport: { send } as never,
    });
    const out = await builder.build(baseEvent);
    expect(out.content).toContain("Auto-templated reflection (LLM returned empty)");
  });
});
```

- [ ] **Step 2: Run tests; confirm fail.**

Run: `pnpm exec vitest run packages/reflector/src/__tests__/haiku_builder.test.ts`

- [ ] **Step 3: Implement**

`packages/reflector/src/haiku_builder.ts`:

```ts
/**
 * LLM-backed ReflectionBuilder (M2 Group 2 Task 7).
 *
 * Calls Anthropic Messages with a small reflection prompt. Falls back
 * to a templated note when the transport throws or returns empty text
 * — Reflector itself already swallows builder errors, but the builder
 * still returns a structurally valid note so the persisted record
 * carries provenance.
 */

import type { HookEvent } from "@petagent/hooks";
import type { ReflectionBuilder } from "./types.js";
import { TemplatedReflectionBuilder } from "./templated_builder.js";

const SYSTEM_PROMPT = `You are an agent's reflective journal.
Given a single heartbeat run summary, write 1-3 sentences in first person
capturing what was attempted, what status the run ended in, and what to
remember next time. No bullet points, no preamble, no headers — just
the reflective sentences. Stay under 80 words.`;

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 256;

export interface ReflectionTransport {
  send(args: { system: string; userMessage: string; maxTokens: number; model: string }): Promise<string>;
}

export interface HaikuReflectionBuilderDeps {
  transport: ReflectionTransport;
  model?: string;
  maxTokens?: number;
}

export class HaikuReflectionBuilder implements ReflectionBuilder {
  private readonly transport: ReflectionTransport;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fallback = new TemplatedReflectionBuilder();

  constructor(deps: HaikuReflectionBuilderDeps) {
    this.transport = deps.transport;
    this.model = deps.model ?? DEFAULT_MODEL;
    this.maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async build(event: HookEvent): Promise<{ content: string; noteType: string }> {
    const userMessage = renderUserMessage(event);
    let llmText = "";
    try {
      llmText = (await this.transport.send({
        system: SYSTEM_PROMPT,
        userMessage,
        maxTokens: this.maxTokens,
        model: this.model,
      })).trim();
    } catch (err) {
      const templated = this.fallback.build(event);
      return {
        content: templated.content.replace(
          "Auto-templated reflection.",
          `Auto-templated reflection (LLM call failed: ${truncate(String(err), 80)}).`,
        ),
        noteType: templated.noteType,
      };
    }
    if (llmText.length === 0) {
      const templated = this.fallback.build(event);
      return {
        content: templated.content.replace(
          "Auto-templated reflection.",
          "Auto-templated reflection (LLM returned empty).",
        ),
        noteType: templated.noteType,
      };
    }
    return { content: llmText, noteType: "heartbeat_reflection" };
  }
}

function renderUserMessage(event: HookEvent): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const status = typeof payload.status === "string" ? payload.status : "unknown";
  const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : null;
  const lines = [
    `status: ${status}`,
    durationMs !== null ? `duration: ${durationMs}ms` : null,
    event.issueId ? `issue: ${event.issueId}` : null,
    event.agentId ? `agent: ${event.agentId}` : null,
  ].filter(Boolean) as string[];
  return `Heartbeat run summary:\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
```

> The templated fallback `Auto-templated reflection.` literal must match `templated_builder.ts` exactly. If that string was edited later, update both files.

In `packages/reflector/src/index.ts`, add:

```ts
export { HaikuReflectionBuilder } from "./haiku_builder.js";
export type { HaikuReflectionBuilderDeps, ReflectionTransport } from "./haiku_builder.js";
export { AnthropicHttpReflectionTransport, extractFirstText } from "./anthropic_transport.js";
export type {
  AnthropicHttpReflectionTransportOptions,
  AnthropicMessagesResponse,
} from "./anthropic_transport.js";
```

- [ ] **Step 4: Run tests; confirm pass (5/5).**

- [ ] **Step 5: Typecheck `pnpm --filter @petagent/reflector typecheck`**

- [ ] **Step 6: Commit**

```bash
git add packages/reflector/src/haiku_builder.ts \
        packages/reflector/src/__tests__/haiku_builder.test.ts \
        packages/reflector/src/index.ts
git commit -m "$(cat <<'EOF'
feat(m2,reflector): HaikuReflectionBuilder (M2 G2 Task 7)

LLM-backed ReflectionBuilder. Calls Anthropic Messages with a tight
reflection prompt (1-3 first-person sentences, under 80 words).
Falls back to a marked templated note when the transport throws or
returns empty text, so persisted records always carry provenance.

The Reflector class itself already swallows builder errors; this
fallback only ensures structural integrity of the returned note.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 3: `createReflector` factory selects builder based on key

**Files:**
- Modify: `server/src/composition/reflector.ts`
- Modify: `server/src/__tests__/composition-reflector.test.ts`

- [ ] **Step 1: Append failing tests**

In `server/src/__tests__/composition-reflector.test.ts`, append:

```ts
describe("createReflector builder selection", () => {
  it("uses templated builder when no Anthropic key", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { reflectorEnabled: true, notesGitStoreDir: tmpRoot } as Config,
      resolveAnthropicKey: () => null,
    });
    expect(out).not.toBeNull();
    expect(out!.builderKind).toBe("templated");
  });

  it("uses Haiku builder when Anthropic key provided", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { reflectorEnabled: true, notesGitStoreDir: tmpRoot } as Config,
      resolveAnthropicKey: () => "sk-ant-test",
    });
    expect(out).not.toBeNull();
    expect(out!.builderKind).toBe("haiku");
  });
});
```

- [ ] **Step 2: Update `createReflector`**

In `server/src/composition/reflector.ts`:

1. Add imports:
```ts
import {
  Reflector,
  HaikuReflectionBuilder,
  AnthropicHttpReflectionTransport,
  type NotesSink,
  type ReflectionBuilder,
} from "@petagent/reflector";
```

2. Extend `ReflectorFactoryDeps`:
```ts
export interface ReflectorFactoryDeps {
  db: Db;
  hookBus: HookBus;
  config: Pick<Config, "reflectorEnabled" | "notesGitStoreDir">;
  resolveAnthropicKey?: () => string | null;
  logger?: { warn(msg: string, meta?: unknown): void };
}
```

3. Extend `ReflectorInstance`:
```ts
export interface ReflectorInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  builderKind: "templated" | "haiku";
}
```

4. Inside `createReflector`, after the existing `if (!deps.config.reflectorEnabled) return null;` and `await store.init()`, decide builder:

```ts
  const apiKey = deps.resolveAnthropicKey?.() ?? null;
  let builder: ReflectionBuilder | undefined;
  let builderKind: "templated" | "haiku" = "templated";
  if (apiKey) {
    builder = new HaikuReflectionBuilder({
      transport: new AnthropicHttpReflectionTransport({ apiKey }),
    });
    builderKind = "haiku";
  }
```

5. Pass `builder` into `new Reflector({ ..., builder })` (existing line — add the field):

```ts
  const reflector = new Reflector({
    bus: deps.hookBus,
    notesSink: sink,
    builder, // undefined → Reflector default = TemplatedReflectionBuilder
    logger: deps.logger,
  });

  return {
    start: () => reflector.start(),
    stop: () => reflector.stop(),
    builderKind,
  };
```

- [ ] **Step 3: Run tests; confirm pass (4/4 — 2 existing + 2 new).**

Run: `pnpm exec vitest run server/src/__tests__/composition-reflector.test.ts`

- [ ] **Step 4: Typecheck `pnpm --filter @petagent/server typecheck`**

- [ ] **Step 5: Commit**

```bash
git add server/src/composition/reflector.ts \
        server/src/__tests__/composition-reflector.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): createReflector picks Haiku builder when key set

Adds optional `resolveAnthropicKey` to the factory deps and selects
HaikuReflectionBuilder over the default TemplatedReflectionBuilder
when the closure returns a non-null key. Returned instance now
exposes `builderKind: "templated" | "haiku"` for startup logs.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 4: app.ts — pass `resolveAnthropicKey` to reflector factory

**Files:**
- Modify: `server/src/app.ts`

- [ ] **Step 1: Update the `createReflector` call**

In `server/src/app.ts`, find:

```ts
  const reflector = await createReflector({
    db,
    hookBus: globalHookBus,
    config: {
      reflectorEnabled: opts.reflectorEnabled ?? false,
      notesGitStoreDir: opts.notesGitStoreDir ?? "",
    },
    logger: console,
  });
  if (reflector) {
    await reflector.start();
    console.log("[petagent] reflector started");
  }
```

Replace with:

```ts
  const reflector = await createReflector({
    db,
    hookBus: globalHookBus,
    config: {
      reflectorEnabled: opts.reflectorEnabled ?? false,
      notesGitStoreDir: opts.notesGitStoreDir ?? "",
    },
    resolveAnthropicKey: () => process.env.ANTHROPIC_API_KEY?.trim() || null,
    logger: console,
  });
  if (reflector) {
    await reflector.start();
    console.log(`[petagent] reflector started (builder=${reflector.builderKind})`);
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @petagent/server typecheck`

- [ ] **Step 3: Commit**

```bash
git add server/src/app.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): plumb ANTHROPIC_API_KEY into reflector factory

Mirrors how createPsychologist receives the key: a closure read from
process.env at boot time. Startup log now includes the picked
builder ("templated" or "haiku") for parity with classifier kind
logging.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 5: Final verification

- [ ] **Step 1: Typecheck `pnpm typecheck`**
- [ ] **Step 2: Vitest `pnpm exec vitest run`** — expect ~2034 passing (2024 baseline + ~10 new tests).
- [ ] **Step 3: Update memory** with the new test count and a one-line note that `builderKind` now decorates the reflector factory return value.

(No new tag — this is incremental on top of `v0.3.0-m2-preview`. A `v0.3.1` could be considered later if the user wants a separate marker.)
