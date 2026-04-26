# M2 Task 30a — Real Embedding API Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development`.

**Goal:** Replace the deterministic SHA-256 stub in `EmbeddingService.callEmbedAPI` with a real OpenAI-compatible embeddings call. Auto-upgrade based on `OPENAI_API_KEY` env (parallel to how Psychologist / Reflector already auto-upgrade on `ANTHROPIC_API_KEY`). Keep the stub as the local-dev fallback so tests stay deterministic.

**Architecture:** New `EmbeddingTransport` port in `@petagent/skills` (fetch-based, mirrors the classifier / reflector transport pattern). `OpenAIEmbeddingTransport` ships as the production implementation, hitting `POST https://api.openai.com/v1/embeddings` with model `text-embedding-3-small` (1536 dim, native match to migration 0059's `vector(1536)` column). `EmbeddingService.embedBatch` calls `transport.embed(texts)` when configured; otherwise the stub. New server `createEmbeddingService(env)` helper centralizes the env-driven choice and is used by both `composition/reflector.ts` and `routes/agent-notes.ts`.

**Tech Stack:** TypeScript, vitest, `fetch` (no SDK). No new deps.

**Spec reference:** Original M2 plan Task 30a — "Anthropic 兼容的 voyage-3 或 OpenAI text-embedding-ada-002". We ship `text-embedding-3-small` (the modern 1536-dim successor to ada-002) since it natively matches the schema; Voyage support can be added later via the same port (Voyage is 1024-dim, would need either a schema migration or zero-padding — out of scope here).

---

## File Map

**New files:**
- `packages/skills/src/embedding_transport.ts` — `EmbeddingTransport` port + `OpenAIEmbeddingTransport` class
- `packages/skills/src/__tests__/embedding_transport.test.ts` — ~4 cases
- `server/src/composition/embedding.ts` — `createEmbeddingService(env)` helper
- `server/src/__tests__/composition-embedding.test.ts` — ~3 cases

**Modified files:**
- `packages/skills/src/embedding.ts` — replace `callEmbedAPI` body with transport call; accept optional `transport` dep
- `packages/skills/src/__tests__/embedding.test.ts` — append ~3 cases for transport path
- `packages/skills/src/index.ts` — re-export new transport types
- `server/src/composition/reflector.ts` — use `createEmbeddingService(process.env)` instead of bare `new EmbeddingService()`
- `server/src/routes/agent-notes.ts` — same change for the search route
- `server/src/app.ts` — startup log indicating embedding kind (`stub` vs `openai`)

---

## Task 1: `EmbeddingTransport` port + `OpenAIEmbeddingTransport`

**Files:**
- Create: `packages/skills/src/embedding_transport.ts`
- Create: `packages/skills/src/__tests__/embedding_transport.test.ts`

#### Step 1: Failing tests

Create `packages/skills/src/__tests__/embedding_transport.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { OpenAIEmbeddingTransport } from "../embedding_transport.js";

function fakeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAIEmbeddingTransport", () => {
  it("POSTs input + model to /v1/embeddings with bearer auth", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({
        data: [
          { embedding: [0.1, 0.2, 0.3] },
          { embedding: [0.4, 0.5, 0.6] },
        ],
      }),
    );
    const transport = new OpenAIEmbeddingTransport({
      apiKey: "sk-test",
      model: "text-embedding-3-small",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await transport.embed(["a", "b"]);
    expect(out).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    const call = (fetchImpl.mock.calls[0] as unknown[]);
    expect(call[0]).toBe("https://api.openai.com/v1/embeddings");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer sk-test");
    expect(headers["content-type"]).toBe("application/json");
    const payload = JSON.parse(init.body as string);
    expect(payload.model).toBe("text-embedding-3-small");
    expect(payload.input).toEqual(["a", "b"]);
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("nope", { status: 401, statusText: "Unauthorized", headers: {} }),
    );
    const transport = new OpenAIEmbeddingTransport({
      apiKey: "sk-bad",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(transport.embed(["x"])).rejects.toThrow(/HTTP 401/);
  });

  it("honors custom baseUrl + model", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeOk({ data: [{ embedding: [0.0] }] }),
    );
    const transport = new OpenAIEmbeddingTransport({
      apiKey: "sk-test",
      baseUrl: "https://gateway.example/openai/",
      model: "text-embedding-3-large",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.embed(["x"]);
    const call = (fetchImpl.mock.calls[0] as unknown[]);
    expect(call[0]).toBe("https://gateway.example/openai/v1/embeddings");
    const init = call[1] as RequestInit;
    const payload = JSON.parse(init.body as string);
    expect(payload.model).toBe("text-embedding-3-large");
  });

  it("constructor throws when fetch is unavailable and no fetchImpl is passed", () => {
    const orig = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = undefined;
    try {
      expect(
        () => new OpenAIEmbeddingTransport({ apiKey: "k" }),
      ).toThrow(/fetch/);
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = orig;
    }
  });
});
```

#### Step 2: Run; confirm fail

Run: `pnpm exec vitest run packages/skills/src/__tests__/embedding_transport.test.ts`
Expected: FAIL — module not found.

#### Step 3: Implement

Create `packages/skills/src/embedding_transport.ts`:

```ts
/**
 * Embedding transport port + OpenAI-compatible fetch-based implementation
 * (M2 Task 30a). Mirrors the AnthropicHttpClassifierTransport / 
 * AnthropicHttpReflectionTransport pattern: no SDK dependency, all options
 * injectable for tests.
 *
 * Default model is `text-embedding-3-small` which natively returns
 * 1536-dim vectors — matching migration 0059's `vector(1536)` column on
 * `agent_notes`. Voyage AI (1024-dim) support would need either a
 * schema migration or zero-padding and is out of scope here.
 */

export interface EmbeddingTransport {
  embed(texts: string[]): Promise<number[][]>;
}

export interface OpenAIEmbeddingTransportOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenAIEmbeddingTransport implements EmbeddingTransport {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OpenAIEmbeddingTransportOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = opts.model ?? DEFAULT_MODEL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "OpenAIEmbeddingTransport: no fetch implementation available. " +
          "Pass opts.fetchImpl or run on Node 18+.",
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `OpenAIEmbeddingTransport: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        );
      }
      const body = (await res.json()) as OpenAIEmbeddingResponse;
      const data = Array.isArray(body.data) ? body.data : [];
      return data.map((d) => (Array.isArray(d.embedding) ? d.embedding : []));
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}
```

In `packages/skills/src/index.ts`, append:

```ts
export {
  OpenAIEmbeddingTransport,
} from "./embedding_transport.js";
export type {
  EmbeddingTransport,
  OpenAIEmbeddingTransportOptions,
  OpenAIEmbeddingResponse,
} from "./embedding_transport.js";
```

#### Step 4: Run tests

Run: `pnpm exec vitest run packages/skills/src/__tests__/embedding_transport.test.ts`
Expected: PASS — 4 tests.

#### Step 5: Typecheck

Run: `pnpm --filter @petagent/skills typecheck`
Expected: clean.

#### Step 6: Commit

```bash
git add packages/skills/src/embedding_transport.ts \
        packages/skills/src/__tests__/embedding_transport.test.ts \
        packages/skills/src/index.ts
git commit -m "$(cat <<'EOF'
feat(m2,skills): EmbeddingTransport port + OpenAIEmbeddingTransport

fetch-based OpenAI Embeddings API client. Mirrors the
AnthropicHttpClassifierTransport pattern — no SDK, all options
injectable for tests. Default model text-embedding-3-small returns
1536-dim vectors, matching migration 0059's vector(1536) column on
agent_notes.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 2: `EmbeddingService.callEmbedAPI` uses the transport

**Files:**
- Modify: `packages/skills/src/embedding.ts`
- Modify: `packages/skills/src/__tests__/embedding.test.ts`

#### Step 1: Append failing tests

In `packages/skills/src/__tests__/embedding.test.ts`, append:

```ts
import { OpenAIEmbeddingTransport } from "../embedding_transport.js";
import type { EmbeddingTransport } from "../embedding_transport.js";

describe("EmbeddingService with transport", () => {
  it("delegates embedBatch to the transport when useStub is false", async () => {
    const transport: EmbeddingTransport = {
      embed: vi.fn(async (texts: string[]) =>
        texts.map(() => new Array<number>(1536).fill(0)),
      ),
    };
    const svc = new EmbeddingService({ apiKey: "sk-test", useStub: false, transport });
    const out = await svc.embedBatch(["a", "b"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(1536);
    expect(transport.embed).toHaveBeenCalledWith(["a", "b"]);
  });

  it("uses stub when no transport and useStub is unspecified", async () => {
    const svc = new EmbeddingService();
    const out = await svc.embed("x");
    expect(out).toHaveLength(1536);
  });

  it("throws when useStub:false and no transport provided", async () => {
    const svc = new EmbeddingService({ apiKey: "sk-test", useStub: false });
    await expect(svc.embedBatch(["x"])).rejects.toThrow(/transport/i);
  });
});
```

> Add `import { vi } from "vitest"` at the top if it isn't already present.

#### Step 2: Run; confirm fail

Run: `pnpm exec vitest run packages/skills/src/__tests__/embedding.test.ts`
Expected: FAIL — `transport` option not accepted; or `callEmbedAPI` still throws "not implemented".

#### Step 3: Implement

Open `packages/skills/src/embedding.ts`. Modify the file as follows:

1. Update the imports at the top:

```ts
import { createHash } from "node:crypto";
import type { EmbeddingTransport } from "./embedding_transport.js";
```

2. Update `EmbeddingServiceOptions`:

```ts
export interface EmbeddingServiceOptions {
  apiKey?: string;
  model?: string;
  /** Force stub or real-API mode. When unset, uses stub iff apiKey is undefined. */
  useStub?: boolean;
  /** Required when useStub is false. Builds the actual API call. */
  transport?: EmbeddingTransport;
}
```

3. Update the class:

```ts
export class EmbeddingService {
  private readonly useStub: boolean;
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly transport: EmbeddingTransport | undefined;

  constructor(opts: EmbeddingServiceOptions = {}) {
    const useStub = opts.useStub ?? opts.apiKey === undefined;
    if (!useStub && !opts.apiKey) {
      throw new Error("EmbeddingService: apiKey is required when useStub is false.");
    }
    this.useStub = useStub;
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "text-embedding-3-small";
    this.transport = opts.transport;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.useStub) {
      return texts.map((t) => stubEmbed(t));
    }
    return this.callEmbedAPI(texts);
  }

  private async callEmbedAPI(texts: string[]): Promise<number[][]> {
    if (!this.transport) {
      throw new Error(
        "EmbeddingService: no transport configured for real API mode. " +
          "Pass `transport` in the constructor (e.g. new OpenAIEmbeddingTransport({ apiKey })).",
      );
    }
    void this.apiKey;
    void this.model;
    return this.transport.embed(texts);
  }
}
```

(The `void this.apiKey; void this.model;` lines silence unused-field warnings — apiKey/model are still kept on the instance for potential future use/diagnostics, but the transport carries them now.)

#### Step 4: Run tests

Run: `pnpm exec vitest run packages/skills/src/__tests__/embedding.test.ts`
Expected: PASS — 8 tests (5 existing + 3 new).

#### Step 5: Typecheck

Run: `pnpm --filter @petagent/skills typecheck`

#### Step 6: Commit

```bash
git add packages/skills/src/embedding.ts \
        packages/skills/src/__tests__/embedding.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,skills): EmbeddingService delegates to EmbeddingTransport

callEmbedAPI now calls into an injected EmbeddingTransport instead of
throwing "not implemented yet". Constructor accepts an optional
`transport` field; useStub:false without `transport` raises a clear
configuration error rather than failing at first embed call.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 3: `createEmbeddingService` server helper

**Files:**
- Create: `server/src/composition/embedding.ts`
- Create: `server/src/__tests__/composition-embedding.test.ts`

#### Step 1: Failing tests

Create `server/src/__tests__/composition-embedding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createEmbeddingService } from "../composition/embedding.js";

describe("createEmbeddingService", () => {
  it("returns stub-mode service when no OPENAI_API_KEY", () => {
    const result = createEmbeddingService({});
    expect(result.kind).toBe("stub");
    // smoke: embed actually returns a vector
    return result.service.embed("hello").then((vec) => {
      expect(vec).toHaveLength(1536);
    });
  });

  it("returns openai-mode service when OPENAI_API_KEY is set", () => {
    const result = createEmbeddingService({ OPENAI_API_KEY: "sk-test" });
    expect(result.kind).toBe("openai");
    expect(result.service).toBeDefined();
  });

  it("treats whitespace-only OPENAI_API_KEY as absent", () => {
    const result = createEmbeddingService({ OPENAI_API_KEY: "   " });
    expect(result.kind).toBe("stub");
  });
});
```

#### Step 2: Run; confirm fail

Run: `pnpm exec vitest run server/src/__tests__/composition-embedding.test.ts`
Expected: FAIL — module not found.

#### Step 3: Implement

Create `server/src/composition/embedding.ts`:

```ts
/**
 * Composition factory for the EmbeddingService (M2 Task 30a).
 *
 * Reads OPENAI_API_KEY (and optional OPENAI_EMBEDDING_MODEL) from the
 * provided environment object and returns either a real-API service
 * backed by OpenAIEmbeddingTransport, or a stub-mode service for
 * environments without a key. Centralizing the decision here keeps
 * the Reflector composition and the agent-notes search route in lock
 * step — both call createEmbeddingService and never construct
 * EmbeddingService directly.
 */

import {
  EmbeddingService,
  OpenAIEmbeddingTransport,
} from "@petagent/skills";

export type EmbeddingServiceKind = "stub" | "openai";

export interface CreateEmbeddingServiceResult {
  service: EmbeddingService;
  kind: EmbeddingServiceKind;
}

export function createEmbeddingService(
  env: Pick<NodeJS.ProcessEnv, "OPENAI_API_KEY" | "OPENAI_EMBEDDING_MODEL">,
): CreateEmbeddingServiceResult {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey.length === 0) {
    return { service: new EmbeddingService(), kind: "stub" };
  }
  const model = env.OPENAI_EMBEDDING_MODEL?.trim() || undefined;
  const transport = new OpenAIEmbeddingTransport({ apiKey, model });
  return {
    service: new EmbeddingService({ apiKey, useStub: false, transport, model }),
    kind: "openai",
  };
}
```

#### Step 4: Run; confirm pass

Run: `pnpm exec vitest run server/src/__tests__/composition-embedding.test.ts`
Expected: PASS — 3 tests.

#### Step 5: Typecheck

Run: `pnpm --filter @petagent/server typecheck`

#### Step 6: Commit

```bash
git add server/src/composition/embedding.ts \
        server/src/__tests__/composition-embedding.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): createEmbeddingService env-driven factory

Centralizes the OPENAI_API_KEY → real-API-vs-stub decision so the
Reflector composition and the agent-notes search route never
construct EmbeddingService directly. Returns { service, kind } so
startup logs can announce which mode is in use.

OPENAI_EMBEDDING_MODEL is honored when set (defaults to
text-embedding-3-small from the transport).

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 4: Wire the helper into reflector composition + notes route

**Files:**
- Modify: `server/src/composition/reflector.ts`
- Modify: `server/src/routes/agent-notes.ts`
- Modify: `server/src/app.ts`

#### Step 1: Reflector composition

In `server/src/composition/reflector.ts`, find:

```ts
  const embedder = new EmbeddingService();
```

Replace with:

```ts
  const embedder = createEmbeddingService(process.env).service;
```

Add the import at the top:

```ts
import { createEmbeddingService } from "./embedding.js";
```

Remove the `EmbeddingService` import from `@petagent/skills` if it's no longer referenced anywhere else in the file. If it IS still referenced (e.g. for the type), keep the named import but only for the type.

#### Step 2: Notes search route

In `server/src/routes/agent-notes.ts`, find the search-route handler with:

```ts
const embedder = new EmbeddingService();
```

Replace with:

```ts
const embedder = createEmbeddingService(process.env).service;
```

Add the import at the top:

```ts
import { createEmbeddingService } from "../composition/embedding.js";
```

> **Important:** the search route currently constructs a fresh `EmbeddingService` per request, and we keep that — `createEmbeddingService` is fast (no network IO at construction time; the transport just stores the key + fetch impl). For very high-traffic deployments a per-app-instance cache would help, but that's a future optimization.

#### Step 3: Startup log in `app.ts`

In `server/src/app.ts`, after the existing `console.log` for `psychologist started` and `reflector started`, insert a one-time embedding-mode announcement. Find the existing reflector startup block:

```ts
  if (reflector) {
    await reflector.start();
    console.log(`[petagent] reflector started (builder=${reflector.builderKind})`);
  }
```

After it, add:

```ts
  const embeddingKind = createEmbeddingService(process.env).kind;
  console.log(`[petagent] embedding service mode: ${embeddingKind}`);
```

Add the import at the top alongside the other composition imports:

```ts
import { createEmbeddingService } from "./composition/embedding.js";
```

(This is purely informational — the actual service instances inside reflector / notes route are constructed independently and would need to use the same env to stay consistent.)

#### Step 4: Verify existing tests still pass

Run:
```
pnpm exec vitest run server/src/__tests__/composition-reflector.test.ts \
                    server/src/__tests__/composition-embedding.test.ts
```
Expected: PASS — 7 tests total (4 reflector + 3 embedding).

#### Step 5: Typecheck

Run: `pnpm --filter @petagent/server typecheck`

#### Step 6: Commit

```bash
git add server/src/composition/reflector.ts \
        server/src/routes/agent-notes.ts \
        server/src/app.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): plumb createEmbeddingService through reflector + notes route

Both the Reflector composition and the agent-notes search route now
build their EmbeddingService through createEmbeddingService(process.env),
which auto-upgrades to OpenAI text-embedding-3-small when
OPENAI_API_KEY is set and falls back to the deterministic SHA-256 stub
otherwise. createApp logs the chosen mode at startup.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 5: Final verification + memory update

- [ ] **Step 1:** `pnpm typecheck` clean across all packages.
- [ ] **Step 2:** `pnpm exec vitest run` — expect ~2052 passing (2042 baseline + ~10 new tests: 4 transport + 3 embedding-with-transport + 3 composition-embedding). The 3-4 known M0 flakes (workspace-runtime + occasional concurrency) remain.
- [ ] **Step 3:** Update memory — note the new transport port, the env-driven factory, and OPENAI_API_KEY as a third opt-in env (alongside ANTHROPIC_API_KEY for psychologist/reflector).
- [ ] **Step 4 (optional):** No new tag yet. v0.3.1-m2-preview can be tagged after this lands if the user wants a marker.
