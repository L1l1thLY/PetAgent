# M2 Preview Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the platform alive end-to-end: Psychologist auto-starts behind an env flag, a templated Reflector writes one heartbeat reflection per run, and a `/notes` UI page lists / searches them. Tag `v0.3.0-m2-preview`.

**Architecture:** Two factory modules in `server/src/composition/` instantiate the existing M1 + M2 G1 building blocks behind config flags. New `@petagent/reflector` package provides the heartbeat-end subscriber (zero-DB, ports + adapters). One added `BehavioralPassthroughClassifier` lets Psychologist fire without an Anthropic key. One small `live-events.ts` change publishes `heartbeat.ended` on the global HookBus.

**Tech Stack:** TypeScript, vitest, drizzle-orm, Express, React Router. Existing packages only — no new deps.

**Spec:** `docs/specs/2026-04-26-m2-preview-milestone-design.md`

---

## File Map

**New files:**

| Path | Responsibility |
|---|---|
| `packages/reflector/` | New package: `src/types.ts` (NotesSink + ReflectionBuilder ports), `src/templated_builder.ts`, `src/reflector.ts`, `src/index.ts`, `package.json`, `tsconfig.json`. |
| `packages/reflector/src/__tests__/templated_builder.test.ts` | 3 cases. |
| `packages/reflector/src/__tests__/reflector.test.ts` | 5 cases. |
| `packages/psychologist/src/__tests__/behavioral_passthrough.test.ts` | 3 cases for the new classifier. |
| `server/src/composition/psychologist.ts` | `createPsychologist` factory. |
| `server/src/composition/reflector.ts` | `createReflector` factory + `NotesManagerNotesSink` adapter. |
| `server/src/__tests__/composition-psychologist.test.ts` | 3 cases. |
| `server/src/__tests__/composition-reflector.test.ts` | 2 cases. |
| `server/src/__tests__/live-events-heartbeat-ended.test.ts` | 2 cases. |
| `ui/src/pages/Notes.tsx` | New page. |
| `ui/src/pages/__tests__/Notes.test.tsx` | 3 cases. |

**Modified files:**

| Path | Change |
|---|---|
| `packages/psychologist/src/classifier.ts` | Append `BehavioralPassthroughClassifier`. |
| `packages/psychologist/src/index.ts` | Re-export the new classifier. |
| `server/src/services/live-events.ts` | Widen `normalizeEventType` to accept payload; map terminal `heartbeat.run.status` → `heartbeat.ended`. |
| `server/src/config.ts` | Add `psychologistEnabled` / `reflectorEnabled` / `notesGitStoreDir`. |
| `server/src/app.ts` | Import + start `createPsychologist` / `createReflector` after the existing `bridgeHookBusToNotifications` call. |
| `server/package.json` | Add `@petagent/reflector` workspace dep. |
| `ui/src/App.tsx` | Register `<Route path="notes" element={<Notes />} />`. |

---

## Task 1: `BehavioralPassthroughClassifier`

**Files:**
- Modify: `packages/psychologist/src/classifier.ts`
- Modify: `packages/psychologist/src/index.ts`
- Create: `packages/psychologist/src/__tests__/behavioral_passthrough.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/psychologist/src/__tests__/behavioral_passthrough.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BehavioralPassthroughClassifier } from "../classifier.js";

describe("BehavioralPassthroughClassifier", () => {
  it("returns mild recommended_intervention regardless of input", async () => {
    const c = new BehavioralPassthroughClassifier();
    const r = await c.classify(["a", "b"], { issueContext: "anything" });
    expect(r.recommended_intervention).toBe("mild");
  });

  it("returns the constant signal label for downstream aggregation", async () => {
    const c = new BehavioralPassthroughClassifier();
    const r = await c.classify([], { issueContext: "x" });
    expect(r.signals).toEqual(["behavioral_passthrough"]);
  });

  it("returns a fixed mid distress level so incidents have meaningful confidence", async () => {
    const c = new BehavioralPassthroughClassifier();
    const r = await c.classify([], { issueContext: "x" });
    expect(r.distress_level).toBeCloseTo(0.5, 5);
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `pnpm exec vitest run packages/psychologist/src/__tests__/behavioral_passthrough.test.ts`
Expected: FAIL — export not found.

- [ ] **Step 3: Append the classifier**

Append to `packages/psychologist/src/classifier.ts` (after the existing `PromptedClassifier` class):

```ts
/**
 * No-LLM fallback classifier (M2 preview milestone).
 *
 * `Psychologist.onEvent` only invokes the classifier after the behavioral
 * monitor has already raised a non-`none` severity, so this passthrough
 * does not relax that gate — it just decides "yes, intervene mildly"
 * without burning a Haiku call. Useful for local development and for
 * environments without ANTHROPIC_API_KEY.
 */
export class BehavioralPassthroughClassifier implements ClassifierClient {
  async classify(_recentOutputs: string[], _ctx: { issueContext: string }): Promise<ClassifierResult> {
    return {
      distress_level: 0.5,
      signals: ["behavioral_passthrough"],
      recommended_intervention: "mild",
    };
  }
}
```

Also append to `packages/psychologist/src/index.ts`:

```ts
export { BehavioralPassthroughClassifier } from "./classifier.js";
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run packages/psychologist/src/__tests__/behavioral_passthrough.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/psychologist/src/classifier.ts \
        packages/psychologist/src/index.ts \
        packages/psychologist/src/__tests__/behavioral_passthrough.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,psychologist): BehavioralPassthroughClassifier (no-LLM fallback)

Always returns `mild` with the constant `behavioral_passthrough` signal.
Lets Psychologist auto-start in environments without ANTHROPIC_API_KEY:
the upstream behavioral monitor still gates the classifier call (same
mean-2σ trigger), so this only decides "yes, intervene mildly" without
the Haiku round-trip.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 2: `heartbeat.run.status` → `heartbeat.ended` mapping

**Files:**
- Modify: `server/src/services/live-events.ts`
- Create: `server/src/__tests__/live-events-heartbeat-ended.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/__tests__/live-events-heartbeat-ended.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { globalHookBus } from "@petagent/hooks";
import { publishLiveEvent } from "../services/live-events.js";

describe("live-events → heartbeat.ended HookBus mapping", () => {
  let received: Array<{ type: string; agentId?: string; companyId: string }> = [];
  const subscriberName = "test-heartbeat-ended-subscriber";

  beforeEach(() => {
    received = [];
    globalHookBus.register({
      name: subscriberName,
      filter: (e) => e.type === "heartbeat.ended",
      handle: async (e) => {
        received.push({ type: e.type, agentId: e.agentId, companyId: e.companyId });
      },
    });
  });

  afterEach(() => {
    globalHookBus.unregister(subscriberName);
  });

  it("publishes heartbeat.ended on terminal heartbeat.run.status (succeeded)", async () => {
    publishLiveEvent({
      companyId: "co-1",
      type: "heartbeat.run.status",
      payload: { agentId: "agent-1", issueId: "issue-1", status: "succeeded" },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect(received[0].agentId).toBe("agent-1");
  });

  it("does not publish on non-terminal heartbeat.run.status (running)", async () => {
    publishLiveEvent({
      companyId: "co-1",
      type: "heartbeat.run.status",
      payload: { agentId: "agent-1", status: "running" },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `pnpm exec vitest run server/src/__tests__/live-events-heartbeat-ended.test.ts`
Expected: FAIL — no `heartbeat.ended` event arrives because the mapping is missing.

- [ ] **Step 3: Update `normalizeEventType` to accept payload**

In `server/src/services/live-events.ts`, replace this:

```ts
function normalizeEventType(paperclipType: LiveEventType): HookEventType | null {
  switch (paperclipType) {
    case "agent.status":
      return "agent.status_change";
    case "heartbeat.run.queued":
      return "heartbeat.started";
    case "heartbeat.run.status":
      return null;
    case "heartbeat.run.event":
      return "agent.output";
    case "heartbeat.run.log":
      return null;
    case "activity.logged":
      return null;
    default:
      return null;
  }
}
```

with this:

```ts
const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled", "timed_out"]);

function normalizeEventType(
  paperclipType: LiveEventType,
  payload: LiveEventPayload | undefined,
): HookEventType | null {
  switch (paperclipType) {
    case "agent.status":
      return "agent.status_change";
    case "heartbeat.run.queued":
      return "heartbeat.started";
    case "heartbeat.run.status": {
      const status = (payload as { status?: unknown } | undefined)?.status;
      if (typeof status === "string" && TERMINAL_RUN_STATUSES.has(status)) {
        return "heartbeat.ended";
      }
      return null;
    }
    case "heartbeat.run.event":
      return "agent.output";
    case "heartbeat.run.log":
      return null;
    case "activity.logged":
      return null;
    default:
      return null;
  }
}
```

Then update the caller (`forwardToHookBus`) to pass the payload:

```ts
function forwardToHookBus(event: LiveEvent) {
  if (event.companyId === "*") return;
  const hookType = normalizeEventType(event.type, event.payload);
  if (!hookType) return;
  // ... rest unchanged
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run server/src/__tests__/live-events-heartbeat-ended.test.ts`
Expected: PASS — 2 cases pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/live-events.ts \
        server/src/__tests__/live-events-heartbeat-ended.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): publish heartbeat.ended on terminal heartbeat.run.status

Existing live-events forwarder maps heartbeat.run.queued → heartbeat.started
and heartbeat.run.event → agent.output, but treats heartbeat.run.status as
unmapped. Without a heartbeat.ended emission the Psychologist subscriber
(filter: heartbeat.ended) never fires after a run completes — it only
sees agent.output during the run.

Widen normalizeEventType to accept the payload and map run.status with
terminal status (succeeded / failed / cancelled / timed_out) to
heartbeat.ended on the global HookBus.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 3: Config additions

**Files:**
- Modify: `server/src/config.ts`

- [ ] **Step 1: Read the current config shape**

Read `server/src/config.ts`. Confirm `Config` interface has `psychologistActorAgentId: string | null` (added in #1d Task 7), `transparencyGamma`, and a `storageLocalDiskBaseDir: string`. Confirm there's a `resolvePsychologistActorAgentId` helper at module scope.

- [ ] **Step 2: Extend the `Config` interface**

In the `Config` interface, after `psychologistActorAgentId: string | null;`, insert:

```ts
  psychologistEnabled: boolean;
  reflectorEnabled: boolean;
  notesGitStoreDir: string;
```

- [ ] **Step 3: Populate the new fields in the return block**

In the config-builder return object (the same one that has `psychologistActorAgentId: resolvePsychologistActorAgentId(),`), add right after that line:

```ts
    psychologistEnabled: process.env.PETAGENT_PSYCHOLOGIST_ENABLED === "true",
    reflectorEnabled: process.env.PETAGENT_REFLECTOR_ENABLED === "true",
    notesGitStoreDir: resolveNotesGitStoreDir(storageLocalDiskBaseDir),
```

> The `storageLocalDiskBaseDir` local is already in scope from the existing storage resolution earlier in the function. Verify by inspection; if the variable name differs, use whatever is available there.

- [ ] **Step 4: Add the resolver helper**

After the existing `resolvePsychologistActorAgentId` helper, add:

```ts
function resolveNotesGitStoreDir(storageBaseDir: string): string {
  const fromEnv = process.env.PETAGENT_NOTES_GIT_STORE_DIR?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return resolve(storageBaseDir, "notes-store");
}
```

> `resolve` is already imported from `node:path` at the top of the file (used by `resolveDefaultStorageDir`).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @petagent/server typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): config psychologistEnabled / reflectorEnabled / notesGitStoreDir

Three new fields gate the M2 preview milestone composition:
- psychologistEnabled (env PETAGENT_PSYCHOLOGIST_ENABLED, default false)
- reflectorEnabled (env PETAGENT_REFLECTOR_ENABLED, default false)
- notesGitStoreDir (env PETAGENT_NOTES_GIT_STORE_DIR;
  defaults to <storageLocalDiskBaseDir>/notes-store)

Both Enabled flags default false so existing deployments are
unaffected; createApp will only call .start() on the factory when
its flag is set.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 4: `createPsychologist` factory

**Files:**
- Create: `server/src/composition/psychologist.ts`
- Create: `server/src/__tests__/composition-psychologist.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/__tests__/composition-psychologist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createPsychologist } from "../composition/psychologist.js";
import { HookBus } from "@petagent/hooks";

const baseConfig = {
  psychologistEnabled: false,
  psychologistActorAgentId: null,
} as unknown as import("../config.js").Config;

const fakeDb = {} as unknown as import("@petagent/db").Db;

describe("createPsychologist", () => {
  it("returns null when disabled", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: baseConfig,
      resolveAnthropicKey: () => null,
    });
    expect(out).toBeNull();
  });

  it("uses BehavioralPassthrough classifier when no API key", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { ...baseConfig, psychologistEnabled: true },
      resolveAnthropicKey: () => null,
    });
    expect(out).not.toBeNull();
    expect(out!.classifierKind).toBe("passthrough");
  });

  it("uses Prompted classifier when API key present", () => {
    const out = createPsychologist({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { ...baseConfig, psychologistEnabled: true },
      resolveAnthropicKey: () => "sk-ant-test",
    });
    expect(out).not.toBeNull();
    expect(out!.classifierKind).toBe("prompted");
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `pnpm exec vitest run server/src/__tests__/composition-psychologist.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the factory**

Create `server/src/composition/psychologist.ts`:

```ts
/**
 * Composition factory for the Psychologist subsystem (M2 preview milestone).
 *
 * Returns null when `config.psychologistEnabled === false`. Otherwise
 * builds the full Psychologist instance from the M1 + #1d ports +
 * concrete drizzle adapters and decides at construction time whether
 * to use the real `PromptedClassifier` (Anthropic API key available)
 * or the no-LLM `BehavioralPassthroughClassifier`.
 *
 * The returned `start()` registers a HookBus subscriber; `stop()`
 * unregisters it. Process exit is the implicit teardown for this
 * preview — long-lived stop wiring is a follow-up.
 */

import {
  BehaviorMonitor,
  BehavioralPassthroughClassifier,
  InterventionDispatcher,
  PromptedClassifier,
  Psychologist,
  type ClassifierClient,
} from "@petagent/psychologist";
import type { HookBus } from "@petagent/hooks";
import type { Db } from "@petagent/db";
import { DrizzleIncidentStore } from "../psychologist/drizzle_incident_store.js";
import { DrizzleBehavioralRecordsStore } from "../psychologist/drizzle_behavioral_store.js";
import { DrizzleCapabilitiesProvider } from "../psychologist/drizzle_capabilities_provider.js";
import { ServicePsychologistActions } from "../psychologist/service_psychologist_actions.js";
import { AnthropicHttpClassifierTransport } from "../psychologist/anthropic_classifier_transport.js";
import { issueService } from "../services/issues.js";
import { agentInstructionsService } from "../services/agent-instructions.js";
import type { Config } from "../config.js";

export interface PsychologistFactoryDeps {
  db: Db;
  hookBus: HookBus;
  config: Pick<Config, "psychologistEnabled" | "psychologistActorAgentId">;
  resolveAnthropicKey: () => string | null;
  logger?: { warn(msg: string, meta?: unknown): void };
}

export interface PsychologistInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  classifierKind: "prompted" | "passthrough";
}

export function createPsychologist(deps: PsychologistFactoryDeps): PsychologistInstance | null {
  if (!deps.config.psychologistEnabled) return null;

  const incidents = new DrizzleIncidentStore(deps.db);
  const records = new DrizzleBehavioralRecordsStore(deps.db);
  const capabilities = new DrizzleCapabilitiesProvider({ db: deps.db });
  const monitor = new BehaviorMonitor(records);

  const apiKey = deps.resolveAnthropicKey();
  let classifier: ClassifierClient;
  let classifierKind: "prompted" | "passthrough";
  if (apiKey) {
    classifier = new PromptedClassifier(new AnthropicHttpClassifierTransport({ apiKey }));
    classifierKind = "prompted";
  } else {
    classifier = new BehavioralPassthroughClassifier();
    classifierKind = "passthrough";
  }

  const actions = new ServicePsychologistActions({
    db: deps.db,
    issueService: issueService(deps.db),
    agentInstructions: agentInstructionsService(),
    systemActorAgentId: deps.config.psychologistActorAgentId,
    logger: deps.logger,
  });

  const dispatcher = new InterventionDispatcher(actions);

  const psych = new Psychologist({
    bus: deps.hookBus,
    monitor,
    classifier,
    dispatcher,
    incidents,
    capabilities,
    records,
  });

  return {
    start: () => psych.start(),
    stop: () => psych.stop(),
    classifierKind,
  };
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run server/src/__tests__/composition-psychologist.test.ts`
Expected: PASS — 3 cases pass.

> Constructing `ServicePsychologistActions` with a fake `db` should not crash because it does not eagerly query. If the `issueService(db)` call eagerly inspects the db at construction time, the tests will fail; in that case, defer instance construction until `start()` is called instead.

- [ ] **Step 5: Commit**

```bash
git add server/src/composition/psychologist.ts \
        server/src/__tests__/composition-psychologist.test.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): createPsychologist factory (composition wiring)

Returns null when PETAGENT_PSYCHOLOGIST_ENABLED is unset. When enabled,
builds the full Psychologist instance from M1 ports + #1d concrete
adapters and decides at construction time whether to use the real
PromptedClassifier (Anthropic API key) or BehavioralPassthroughClassifier
(no-LLM fallback). Returned instance exposes start / stop / classifierKind.

Process exit is implicit teardown for this preview — long-lived stop
wiring is tracked as a follow-up.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 5: `@petagent/reflector` package

**Files:**
- Create: `packages/reflector/package.json`
- Create: `packages/reflector/tsconfig.json`
- Create: `packages/reflector/src/types.ts`
- Create: `packages/reflector/src/templated_builder.ts`
- Create: `packages/reflector/src/reflector.ts`
- Create: `packages/reflector/src/index.ts`
- Create: `packages/reflector/src/__tests__/templated_builder.test.ts`
- Create: `packages/reflector/src/__tests__/reflector.test.ts`

- [ ] **Step 1: Bootstrap the package**

Create `packages/reflector/package.json` (mirror `packages/psychologist/package.json` minimally):

```json
{
  "name": "@petagent/reflector",
  "version": "0.1.0-m2",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    },
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@petagent/hooks": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

Create `packages/reflector/tsconfig.json` (mirror `packages/psychologist/tsconfig.json`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "dist", "node_modules"]
}
```

> If `packages/psychologist/tsconfig.json` differs from this template, copy that one verbatim instead — the goal is to match existing package conventions.

Run: `pnpm install` from repo root to register the new workspace package.

Expected: pnpm reports installation succeeded; `node_modules/@petagent/reflector` is a symlink to `packages/reflector`.

- [ ] **Step 2: Write the failing tests**

Create `packages/reflector/src/__tests__/templated_builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TemplatedReflectionBuilder } from "../templated_builder.js";

describe("TemplatedReflectionBuilder", () => {
  const builder = new TemplatedReflectionBuilder();

  it("renders status from payload", () => {
    const out = builder.build({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "agent-1",
      issueId: "issue-1",
      payload: { status: "succeeded", durationMs: 1234 },
      timestamp: new Date().toISOString(),
    });
    expect(out.noteType).toBe("heartbeat_reflection");
    expect(out.content).toContain("status: succeeded");
    expect(out.content).toContain("duration: 1234ms");
    expect(out.content).toContain("issue: issue-1");
  });

  it("omits duration line when payload has no duration", () => {
    const out = builder.build({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "agent-1",
      payload: { status: "failed" },
      timestamp: new Date().toISOString(),
    });
    expect(out.content).toContain("status: failed");
    expect(out.content).not.toContain("duration:");
  });

  it("falls back to 'unknown' status when payload is empty", () => {
    const out = builder.build({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "agent-1",
      timestamp: new Date().toISOString(),
    });
    expect(out.content).toContain("status: unknown");
  });
});
```

Create `packages/reflector/src/__tests__/reflector.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { HookBus } from "@petagent/hooks";
import { Reflector } from "../reflector.js";
import type { NotesSink } from "../types.js";

let bus: HookBus;
let sink: NotesSink;
let creates: Array<Record<string, unknown>>;

beforeEach(() => {
  bus = new HookBus();
  creates = [];
  sink = {
    create: async (args) => {
      creates.push(args);
      return { id: `note-${creates.length}` };
    },
  };
});

describe("Reflector", () => {
  it("only handles heartbeat.ended events", async () => {
    const r = new Reflector({ bus, notesSink: sink });
    await r.start();
    await bus.publish({ type: "agent.output", companyId: "co-1", agentId: "a", timestamp: "t" });
    expect(creates).toHaveLength(0);
  });

  it("calls notesSink.create with the templated content on heartbeat.ended", async () => {
    const r = new Reflector({ bus, notesSink: sink });
    await r.start();
    await bus.publish({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "a-1",
      issueId: "i-1",
      payload: { status: "succeeded" },
      timestamp: "t",
    });
    expect(creates).toHaveLength(1);
    expect(creates[0].agentId).toBe("a-1");
    expect(creates[0].companyId).toBe("co-1");
    expect(creates[0].sourceIssueId).toBe("i-1");
    expect(creates[0].scope).toBe("project");
    expect(creates[0].noteType).toBe("heartbeat_reflection");
    expect(String(creates[0].content)).toContain("status: succeeded");
  });

  it("debounces consecutive events for the same agent+issue within cooldown", async () => {
    const r = new Reflector({ bus, notesSink: sink, cooldownMs: 10_000 });
    await r.start();
    const evt = {
      type: "heartbeat.ended" as const,
      companyId: "co-1",
      agentId: "a-1",
      issueId: "i-1",
      payload: { status: "succeeded" },
      timestamp: "t",
    };
    await bus.publish(evt);
    await bus.publish(evt);
    expect(creates).toHaveLength(1);
  });

  it("never throws when sink rejects", async () => {
    const failing: NotesSink = { create: async () => { throw new Error("db down"); } };
    const warns: Array<{ msg: string }> = [];
    const r = new Reflector({
      bus,
      notesSink: failing,
      logger: { warn: (msg) => warns.push({ msg: String(msg) }) },
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
    expect(warns.length).toBe(1);
  });

  it("ignores events without agentId or companyId", async () => {
    const r = new Reflector({ bus, notesSink: sink });
    await r.start();
    await bus.publish({ type: "heartbeat.ended", companyId: "co-1", timestamp: "t" });
    expect(creates).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the tests (fail expected)**

Run: `pnpm exec vitest run packages/reflector/src/__tests__/`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the package**

Create `packages/reflector/src/types.ts`:

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

export interface ReflectionBuilder {
  build(event: HookEvent): { content: string; noteType: string };
}
```

Create `packages/reflector/src/templated_builder.ts`:

```ts
import type { HookEvent } from "@petagent/hooks";
import type { ReflectionBuilder } from "./types.js";

/**
 * No-LLM templated reflection — captures the bare facts of a heartbeat
 * run. M2 Group 2 will swap this for a Haiku-backed builder.
 */
export class TemplatedReflectionBuilder implements ReflectionBuilder {
  build(event: HookEvent): { content: string; noteType: string } {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status : "unknown";
    const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : null;
    const issueLine = event.issueId ? `\n- issue: ${event.issueId}` : "";
    const durationLine = durationMs !== null ? `\n- duration: ${durationMs}ms` : "";
    const content =
      `## Heartbeat reflection\n\n` +
      `- status: ${status}${durationLine}${issueLine}\n\n` +
      `Auto-templated reflection. M2 Group 2 will replace this with a Haiku-built note.`;
    return { content, noteType: "heartbeat_reflection" };
  }
}
```

Create `packages/reflector/src/reflector.ts`:

```ts
import type { HookBus, HookEvent } from "@petagent/hooks";
import type { NotesSink, ReflectionBuilder } from "./types.js";
import { TemplatedReflectionBuilder } from "./templated_builder.js";

export interface ReflectorDeps {
  bus: HookBus;
  notesSink: NotesSink;
  builder?: ReflectionBuilder;
  cooldownMs?: number;
  scope?: "user" | "project" | "local";
  subscriberName?: string;
  logger?: { warn(msg: string, meta?: unknown): void };
}

const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_SCOPE = "project" as const;
const DEFAULT_NAME = "reflector";

export class Reflector {
  private readonly bus: HookBus;
  private readonly notesSink: NotesSink;
  private readonly builder: ReflectionBuilder;
  private readonly cooldownMs: number;
  private readonly scope: "user" | "project" | "local";
  private readonly name: string;
  private readonly logger: { warn(msg: string, meta?: unknown): void };
  private readonly lastWriteAt = new Map<string, number>();

  constructor(deps: ReflectorDeps) {
    this.bus = deps.bus;
    this.notesSink = deps.notesSink;
    this.builder = deps.builder ?? new TemplatedReflectionBuilder();
    this.cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.scope = deps.scope ?? DEFAULT_SCOPE;
    this.name = deps.subscriberName ?? DEFAULT_NAME;
    this.logger = deps.logger ?? { warn: () => {} };
  }

  async start(): Promise<void> {
    this.bus.register({
      name: this.name,
      filter: (e) => e.type === "heartbeat.ended",
      handle: (e) => this.onEnd(e),
    });
  }

  async stop(): Promise<void> {
    this.bus.unregister(this.name);
  }

  private async onEnd(event: HookEvent): Promise<void> {
    if (!event.agentId || !event.companyId) return;
    const cooldownKey = `${event.agentId}:${event.issueId ?? "no-issue"}`;
    const last = this.lastWriteAt.get(cooldownKey);
    if (last !== undefined && Date.now() - last < this.cooldownMs) return;
    this.lastWriteAt.set(cooldownKey, Date.now());

    try {
      const built = this.builder.build(event);
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
  }
}
```

Create `packages/reflector/src/index.ts`:

```ts
export { Reflector } from "./reflector.js";
export { TemplatedReflectionBuilder } from "./templated_builder.js";
export type { NotesSink, ReflectionBuilder, ReflectorDeps } from "./types.js";
export type { HookEvent } from "@petagent/hooks";
```

- [ ] **Step 5: Run the tests to confirm pass**

Run: `pnpm exec vitest run packages/reflector/src/__tests__/`
Expected: PASS — 8 tests pass (3 templated_builder + 5 reflector).

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter @petagent/reflector typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/reflector/
git commit -m "$(cat <<'EOF'
feat(m2,reflector): @petagent/reflector package (templated MVP)

Zero-DB ports-and-adapters package mirroring @petagent/psychologist.
Subscribes to heartbeat.ended on the HookBus, runs an injectable
ReflectionBuilder over the event, calls an injectable NotesSink to
persist the result. Defaults: 60s cooldown per (agentId, issueId);
scope "project"; subscriber name "reflector".

TemplatedReflectionBuilder ships as the V1 builder — no LLM, just
"## Heartbeat reflection" with status / duration / issue ref. M2 Group
2 will swap in a Haiku-backed builder later via the same port.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 6: `createReflector` factory

**Files:**
- Create: `server/src/composition/reflector.ts`
- Create: `server/src/__tests__/composition-reflector.test.ts`
- Modify: `server/package.json` (add `@petagent/reflector` dep)

- [ ] **Step 1: Add the workspace dep**

In `server/package.json`, add to `dependencies`:

```json
    "@petagent/reflector": "workspace:*",
```

(After the existing `@petagent/psychologist` entry.)

Run: `pnpm install`

- [ ] **Step 2: Write the failing tests**

Create `server/src/__tests__/composition-reflector.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { HookBus } from "@petagent/hooks";
import { createReflector } from "../composition/reflector.js";

const fakeDb = {} as unknown as import("@petagent/db").Db;
const baseConfig = {
  reflectorEnabled: false,
  notesGitStoreDir: "/tmp/petagent-reflector-test-store",
} as unknown as import("../config.js").Config;

describe("createReflector", () => {
  it("returns null when disabled", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: baseConfig,
    });
    expect(out).toBeNull();
  });

  it("returns a startable instance when enabled", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: { ...baseConfig, reflectorEnabled: true },
    });
    expect(out).not.toBeNull();
    expect(typeof out!.start).toBe("function");
    expect(typeof out!.stop).toBe("function");
  });
});
```

- [ ] **Step 3: Run tests to confirm fail**

Run: `pnpm exec vitest run server/src/__tests__/composition-reflector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the factory**

Create `server/src/composition/reflector.ts`:

```ts
/**
 * Composition factory for the Reflector subsystem (M2 preview milestone).
 *
 * Returns null when `config.reflectorEnabled === false`. When enabled,
 * builds a Reflector backed by NotesManager (per-call) and an in-memory
 * EmbeddingService stub. The GitStore is initialized once at factory
 * construction time so subsequent NotesManager.create calls are cheap.
 */

import { Reflector, type NotesSink } from "@petagent/reflector";
import { EmbeddingService, NotesManager } from "@petagent/skills";
import { GitStore } from "@petagent/safety-net";
import type { HookBus } from "@petagent/hooks";
import type { Db } from "@petagent/db";
import type { Config } from "../config.js";

export interface ReflectorFactoryDeps {
  db: Db;
  hookBus: HookBus;
  config: Pick<Config, "reflectorEnabled" | "notesGitStoreDir">;
  logger?: { warn(msg: string, meta?: unknown): void };
}

export interface ReflectorInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createReflector(deps: ReflectorFactoryDeps): Promise<ReflectorInstance | null> {
  if (!deps.config.reflectorEnabled) return null;

  const store = new GitStore({ rootDir: deps.config.notesGitStoreDir });
  await store.init();
  const embedder = new EmbeddingService();

  const sink: NotesSink = {
    async create(args) {
      const mgr = new NotesManager({
        db: deps.db,
        embedder,
        store,
        companyId: args.companyId,
      });
      const note = await mgr.create({
        agentId: args.agentId,
        content: args.content,
        scope: args.scope,
        sourceIssueId: args.sourceIssueId,
        noteType: args.noteType,
      });
      return { id: note.id };
    },
  };

  const reflector = new Reflector({
    bus: deps.hookBus,
    notesSink: sink,
    logger: deps.logger,
  });

  return {
    start: () => reflector.start(),
    stop: () => reflector.stop(),
  };
}
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `pnpm exec vitest run server/src/__tests__/composition-reflector.test.ts`
Expected: PASS — 2 tests pass.

> If the second test fails because `GitStore.init()` rejects (rootDir not creatable), the test should pre-create the dir or mock the GitStore. The simplest version of the second test creates a tmp dir and passes it via config.

- [ ] **Step 6: Commit**

```bash
git add server/src/composition/reflector.ts \
        server/src/__tests__/composition-reflector.test.ts \
        server/package.json
git commit -m "$(cat <<'EOF'
feat(m2,server): createReflector factory (composition wiring)

Backs @petagent/reflector with NotesManager via a per-call adapter.
GitStore is initialized once at factory time so later
notesSink.create() calls are cheap. Returns null when
PETAGENT_REFLECTOR_ENABLED is unset.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 7: `app.ts` startup wiring

**Files:**
- Modify: `server/src/app.ts`

- [ ] **Step 1: Read the wiring point**

Open `server/src/app.ts`. Find the existing line:

```ts
  bridgeHookBusToNotifications({
    bus: globalHookBus,
    store: notificationStore,
  });
```

(approximately line 220 per the current file).

- [ ] **Step 2: Add the imports**

Near the existing `import { bridgeHookBusToNotifications } from "./notifications/hook_bridge.js";` line, add:

```ts
import { createPsychologist } from "./composition/psychologist.js";
import { createReflector } from "./composition/reflector.js";
```

- [ ] **Step 3: Add the startup block**

Immediately after the `bridgeHookBusToNotifications({ ... })` call, add:

```ts
  const psychologist = createPsychologist({
    db,
    hookBus: globalHookBus,
    config,
    resolveAnthropicKey: () => process.env.ANTHROPIC_API_KEY?.trim() || null,
    logger: console,
  });
  if (psychologist) {
    await psychologist.start();
    console.log(`[petagent] psychologist started (classifier=${psychologist.classifierKind})`);
  }

  const reflector = await createReflector({
    db,
    hookBus: globalHookBus,
    config,
    logger: console,
  });
  if (reflector) {
    await reflector.start();
    console.log("[petagent] reflector started");
  }
```

> The `config` variable name must match whatever the surrounding scope uses. If `app.ts` doesn't already have `config` in scope at this point, look at the `createApp` signature; the `config` is typically threaded through `opts` or built from env earlier in the function.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @petagent/server typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts
git commit -m "$(cat <<'EOF'
feat(m2,server): wire Psychologist + Reflector into createApp

Both factories return null when their Enabled config flag is unset,
so default behavior is unchanged. With PETAGENT_PSYCHOLOGIST_ENABLED=true
the Psychologist subscribes to agent.output / heartbeat.ended events on
the global HookBus; with PETAGENT_REFLECTOR_ENABLED=true the Reflector
subscribes to heartbeat.ended and writes a templated note via
NotesManager. Startup logs the classifier kind for observability.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 8: `/notes` UI page

**Files:**
- Create: `ui/src/pages/Notes.tsx`
- Create: `ui/src/pages/__tests__/Notes.test.tsx`
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Read the reference page**

Open `ui/src/pages/Roles.tsx` and read it cover-to-cover. Note: header pattern, `useEffect` data-fetch shape, loading / error / empty states, list rendering. Mirror these.

Also check `ui/src/pages/Interventions.tsx` lines 1–60 for any company/agent context hook usage (e.g., `useCompanyContext`, `useAgents`).

- [ ] **Step 2: Write the failing tests**

Create `ui/src/pages/__tests__/Notes.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Notes } from "../Notes";

// Mock the company / agent context hooks. Adjust the import paths to
// match Interventions.tsx / Roles.tsx convention discovered in Step 1.
vi.mock("../../hooks/useCurrentCompany", () => ({
  useCurrentCompany: () => ({ id: "co-1", name: "Test Co" }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("<Notes />", () => {
  it("lists recent notes from the list endpoint when query is empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "n1", scope: "project", content: "vercel auth via --token", createdAt: new Date().toISOString(), agentId: "a1", noteType: "lesson" },
      ],
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ id: "a1", name: "Alice" }] });
    render(<Notes />);
    await waitFor(() => expect(screen.getByText(/vercel auth/)).toBeInTheDocument());
  });

  it("switches to the search endpoint when query is non-empty", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<Notes />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "vercel" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => {
      const lastUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastUrl).toContain("/notes/search");
      expect(lastUrl).toContain("q=vercel");
    });
  });

  it("includes scope filter in the URL when set", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<Notes />);
    const scopeSelect = await screen.findByLabelText(/scope/i);
    fireEvent.change(scopeSelect, { target: { value: "user" } });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => c[0] as string);
      expect(calls.some((u) => u.includes("scope=user"))).toBe(true);
    });
  });
});
```

> The mocked context-hook path may differ from the codebase's actual convention. After Step 1's reading, adjust the `vi.mock(...)` target to whatever Roles.tsx / Interventions.tsx import — that's the source of truth. If the surrounding pages get the company differently (e.g., a router param, a top-level provider), use that pattern in `Notes.tsx` and reflect it in the mock.

- [ ] **Step 3: Run tests to confirm fail**

Run: `pnpm exec vitest run ui/src/pages/__tests__/Notes.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the page**

Create `ui/src/pages/Notes.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";

interface NoteRow {
  id: string;
  scope: string;
  content: string;
  noteType?: string;
  agentId: string;
  createdAt: string;
}

interface AgentRow {
  id: string;
  name: string;
}

// Use the same context hook the rest of the app uses. The exact path is
// project-specific; if your codebase has `useCurrentCompany` use it,
// otherwise replace this import with whatever Roles.tsx / Interventions.tsx
// uses to derive the active company id.
import { useCurrentCompany } from "../hooks/useCurrentCompany";

export function Notes() {
  const company = useCurrentCompany();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [pendingQuery, setPendingQuery] = useState<string>("");
  const [scope, setScope] = useState<string>("");
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load agents
  useEffect(() => {
    if (!company?.id) return;
    fetch(`/api/companies/${company.id}/agents`)
      .then((r) => r.json())
      .then((list: AgentRow[]) => {
        setAgents(list);
        if (list.length > 0 && !agentId) setAgentId(list[0].id);
      })
      .catch((err) => setError(String(err)));
  }, [company?.id]);

  // Load notes
  useEffect(() => {
    if (!company?.id || !agentId) return;
    setLoading(true);
    setError(null);
    const base = `/api/companies/${company.id}/agents/${agentId}/notes`;
    const params = new URLSearchParams();
    if (scope) params.set("scope", scope);
    let url: string;
    if (query.trim().length > 0) {
      params.set("q", query.trim());
      params.set("topK", "20");
      url = `${base}/search?${params.toString()}`;
    } else {
      params.set("limit", "50");
      url = `${base}?${params.toString()}`;
    }
    fetch(url)
      .then((r) => r.json())
      .then((list: NoteRow[]) => setRows(list))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [company?.id, agentId, query, scope]);

  const submit = () => setQuery(pendingQuery);

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Notes</h1>
      <p className="text-sm text-neutral-500 mb-4">Recent notes left by agents in this company.</p>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          aria-label="Agent"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="border rounded px-2 py-1"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="">all scopes</option>
          <option value="user">user</option>
          <option value="project">project</option>
          <option value="local">local</option>
        </select>
        <input
          placeholder="Search notes…"
          value={pendingQuery}
          onChange={(e) => setPendingQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="border rounded px-2 py-1 flex-1 min-w-[200px]"
        />
        <button onClick={submit} className="border rounded px-3 py-1">
          Search
        </button>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}
      {loading && <div className="text-neutral-500">Loading…</div>}
      {empty && (
        <div className="text-neutral-500">
          No notes yet. Start the Reflector (PETAGENT_REFLECTOR_ENABLED=true) and run an agent.
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((n) => (
          <li key={n.id} className="border rounded p-3">
            <div className="text-xs text-neutral-500 mb-1">
              {n.id} · [{n.scope}]
              {n.noteType ? ` · ${n.noteType}` : ""}
              {n.createdAt ? ` · ${new Date(n.createdAt).toLocaleString()}` : ""}
            </div>
            <pre className="whitespace-pre-wrap text-sm">{n.content}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> If the project's UI library exports a `<PageHeader>` / `<Card>` / `<Select>` from a design system (the `design-guide` skill mentions one), prefer those over raw HTML. Inspect `Roles.tsx` for the conventions; replace the elements above with their counterparts. Do NOT introduce new design tokens.

In `ui/src/App.tsx`, near the existing routes:

```tsx
import { Notes } from "./pages/Notes";
// ...
<Route path="notes" element={<Notes />} />
```

(Place the `<Route>` near the existing `<Route path="interventions" ...>` and `<Route path="roles" ...>` lines.)

- [ ] **Step 5: Run the tests to confirm pass**

Run: `pnpm exec vitest run ui/src/pages/__tests__/Notes.test.tsx`
Expected: PASS — 3 tests pass.

> If a test fails because the mock target path is wrong, fix the mock to match the real hook used by `Roles.tsx` / `Interventions.tsx`. Don't invent a new context hook in `Notes.tsx`.

- [ ] **Step 6: Typecheck UI**

Run: `pnpm --filter @petagent/ui typecheck` (or `pnpm --filter petagent-ui typecheck` — use whatever the workspace name resolves to).
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/Notes.tsx \
        ui/src/pages/__tests__/Notes.test.tsx \
        ui/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(m2,ui): /notes page (list + search via M2 G1 routes)

Read-only browser for agent notes:
- agent dropdown (loads from /api/companies/:cid/agents)
- scope filter (all | user | project | local)
- search input → switches between /notes (list) and /notes/search

Modeled on Roles.tsx; uses the existing company context hook. Notes
creation stays agent-only (CLI / runtime authors); UI is read-only.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 9: Final verification + tag

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: clean across all packages.

- [ ] **Step 2: Full vitest**

Run: `pnpm exec vitest run`
Expected: all green except the 3 pre-existing `workspace-runtime.test.ts` flakes (file-system fixture races, unrelated to this work). New total: ~2024 passing tests (2003 baseline + ~18 new minus skipped integration cases on this host).

- [ ] **Step 3: Manual smoke (optional but recommended)**

```bash
# Build the app once.
pnpm build

# Start the dev server with the milestone enabled.
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
pnpm dev:server
```

Watch the server log for the two `[petagent] ... started` lines.
Open the UI, navigate to `/notes`, confirm the page renders with the
empty state.

This step is best-effort — if it fails because of an unrelated dev
prereq (Docker, secrets, …), don't block the milestone on it. The unit
tests already cover the wiring.

- [ ] **Step 4: Update memory**

Edit `~/.claude/projects/-Volumes-t7-OpenSourceProject-PetAgent/memory/project_petagent.md`:

- Append a "M2 Preview Milestone (2026-04-26)" section under the existing M2 Group 1 block.
- Bump test counts.
- Update the "下一步选择" list: drop "M2 Group 2 templated reflection" (now done as preview), keep "Group 2 LLM-driven reflection" + "Group 3 SkillMiner" + "M2 Task 30a real embedding" at the front.

- [ ] **Step 5: Tag**

```bash
git tag -a v0.3.0-m2-preview -m "M2 preview milestone: psychologist + reflector + notes UI"
```

(If pushing the tag is desired, the user runs `git push origin v0.3.0-m2-preview` themselves; do NOT push it from the implementation phase.)

---

## Notes

- **No new top-level deps.** All composition reuses existing workspace packages.
- **Default behavior unchanged.** Both Enabled flags default false; no existing deployment has its behavior altered until env vars are set.
- **One module-level edit to `live-events.ts`** is the only "structural" change to existing code; everything else is pure addition.
- **Tag at the end, not before.** The tag captures the green state including the smoke step (or the typecheck + vitest if smoke is skipped).
