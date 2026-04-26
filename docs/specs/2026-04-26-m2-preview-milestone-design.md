# M2 Preview Milestone — Psychologist Auto-Start + Light Reflector + Notes UI

## Context

After M1 + post-M1 #1d wiring + M2 Group 1 (Notes layer), the platform has all the building blocks but **none of them are auto-started**:

- `ServicePsychologistActions` / `DrizzleCapabilitiesProvider` / `Psychologist` orchestrator are buildable but `createApp` does not instantiate them.
- `NotesManager` exists but no agent-side code calls `create`. The `agent_notes` table stays empty under normal operation.
- The UI ships `/board` / `/interventions` / `/roles` panels but a user running the platform sees them empty: there is nothing to intervene on, nothing reflective to display.

The original M2 plan tackles this gradually across Groups 2–7. This milestone is a **minimum vertical slice** that makes the system feel alive end-to-end: agents run, Psychologist intervenes when behavioral signals trip, Reflector leaves a per-heartbeat note, the user browses notes in the UI. It does not implement the LLM-driven Reflector, KPI tracking, SkillMiner, or Shadow Mode — those stay in M2 Groups 2–7.

Ship target: tag `v0.3.0-m2-preview` on a clean tree.

Spec references:
- M1 spec §7 (Psychologist) — already realized as ports + concrete implementations.
- M2 plan Groups 1–2 (Notes, Reflector) — Group 1 done; Group 2 deferred except the templated-reflection MVP defined here.
- `2026-04-25-psychologist-actions-wiring-design.md` §6 — explicitly scoped composition wiring out of #1d, deferred here.
- `2026-04-25-m2-notes-layer-design.md` §8 — same deferral for NotesManager long-lived factory.

---

## 1. Architecture

Four units land:

```
packages/psychologist/src/
  classifier.ts                          # +BehavioralPassthroughClassifier (no-LLM fallback)
packages/reflector/                      # NEW package (zero-DB, ports-and-adapters; mirrors @petagent/psychologist)
  src/
    types.ts                             # NotesSink, ReflectionBuilder ports
    templated_builder.ts                 # default builder
    reflector.ts                         # subscribes heartbeat.ended → sink
    index.ts
  package.json / tsconfig.json
server/src/
  services/live-events.ts                # +heartbeat.run.status → heartbeat.ended mapping
  composition/                           # NEW directory
    psychologist.ts                      # createPsychologist factory
    reflector.ts                         # createReflector factory + NotesManagerNotesSink
  app.ts                                 # +start gate after globalHookBus wiring
  config.ts                              # +psychologistEnabled / reflectorEnabled / notesGitStoreDir
ui/src/
  pages/Notes.tsx                        # NEW page (list + search, modeled on Roles.tsx)
  App.tsx                                # +<Route path="notes" element={<Notes />} />
  (sidebar nav)                          # +Notes link if nav registry exists
```

**Design constraints**:
- Both `createPsychologist` and `createReflector` return `null` when their `Enabled` config flag is false; `createApp` calls `start()` on whichever is non-null. Default behavior (no env flags set) is identical to today.
- The `BehavioralPassthroughClassifier` lets Psychologist start without an Anthropic API key. With `ANTHROPIC_API_KEY` set, the factory upgrades to `PromptedClassifier`.
- Reflector lives in its own package because it's a stable port-and-adapter unit that can be swapped wholesale when M2 Group 2 lands the LLM-driven reflection. Following the `@petagent/psychologist` precedent: zero `@petagent/db` imports.
- The new `heartbeat.ended` HookBus mapping is the only existing-code modification beyond `app.ts` / `config.ts`. It's a one-line addition to `normalizeEventType`.

## 2. `BehavioralPassthroughClassifier`

```ts
// packages/psychologist/src/classifier.ts (append)
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

- Always returns `mild`. Behavior monitoring upstream (`Psychologist.onEvent`) already gates: classifier is only called when `monitor.check(agentId).behavioralSeverity !== "none"`. So Psych still only fires on real behavioral signals; this classifier just decides "yes, intervene mildly" without the LLM call.
- The `signals: ["behavioral_passthrough"]` constant lets `topSignalsForAgent` aggregate this distinctly from real-classifier signals.
- Re-exported from `packages/psychologist/src/index.ts`.

## 3. `createPsychologist`

```ts
// server/src/composition/psychologist.ts
import {
  Psychologist,
  BehaviorMonitor,
  PromptedClassifier,
  BehavioralPassthroughClassifier,
  InterventionDispatcher,
  type ClassifierClient,
} from "@petagent/psychologist";
import { DrizzleIncidentStore } from "../psychologist/drizzle_incident_store.js";
import { DrizzleBehavioralRecordsStore } from "../psychologist/drizzle_behavioral_store.js";
import { DrizzleCapabilitiesProvider } from "../psychologist/drizzle_capabilities_provider.js";
import { ServicePsychologistActions } from "../psychologist/service_psychologist_actions.js";
import { AnthropicHttpClassifierTransport } from "../psychologist/anthropic_classifier_transport.js";
import { issueService } from "../services/issues.js";
import { agentInstructionsService } from "../services/agent-instructions.js";
import type { HookBus } from "@petagent/hooks";
import type { Db } from "@petagent/db";
import type { Config } from "../config.js";

export interface PsychologistFactoryDeps {
  db: Db;
  hookBus: HookBus;
  config: Config;
  resolveAnthropicKey: () => string | null;
  logger?: { warn(msg: string, meta?: unknown): void };
}

export interface PsychologistInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** "prompted" if real LLM, "passthrough" if no key — for log/UI */
  classifierKind: "prompted" | "passthrough";
}

export function createPsychologist(deps: PsychologistFactoryDeps): PsychologistInstance | null {
  if (!deps.config.psychologistEnabled) return null;

  const incidents = new DrizzleIncidentStore(deps.db);
  const records = new DrizzleBehavioralRecordsStore(deps.db);
  const capabilities = new DrizzleCapabilitiesProvider({ db: deps.db });
  const monitor = new BehaviorMonitor({ records });

  const apiKey = deps.resolveAnthropicKey();
  let classifier: ClassifierClient;
  let kind: "prompted" | "passthrough";
  if (apiKey) {
    classifier = new PromptedClassifier(new AnthropicHttpClassifierTransport({ apiKey }));
    kind = "prompted";
  } else {
    classifier = new BehavioralPassthroughClassifier();
    kind = "passthrough";
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
    classifierKind: kind,
  };
}
```

`resolveAnthropicKey` is an injected closure: it reads `process.env.ANTHROPIC_API_KEY` first, then falls back to a SecretsService lookup once that wiring lands. For this milestone, the simplest production:

```ts
// in app.ts
resolveAnthropicKey: () => process.env.ANTHROPIC_API_KEY?.trim() || null,
```

## 4. `BehaviorMonitor` constructor surface

The current `@petagent/psychologist` package exports `BehaviorMonitor` but its constructor signature must accept `{ records }` (one dep) for the factory above to compile. **Verify in implementation phase**; if the existing constructor differs, the spec amendment is to use whatever shape it ships with. The plan's Task 0 prep step confirms.

## 5. Reflector package

`packages/reflector/src/types.ts`:

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

`packages/reflector/src/templated_builder.ts`:

```ts
import type { HookEvent } from "@petagent/hooks";
import type { ReflectionBuilder } from "./types.js";

export class TemplatedReflectionBuilder implements ReflectionBuilder {
  build(event: HookEvent): { content: string; noteType: string } {
    const status = (event.payload as Record<string, unknown> | undefined)?.status ?? "unknown";
    const durationMs = (event.payload as Record<string, unknown> | undefined)?.durationMs;
    const issueRef = event.issueId ? `\n- issue: ${event.issueId}` : "";
    const durationLine =
      typeof durationMs === "number" ? `\n- duration: ${durationMs}ms` : "";
    return {
      noteType: "heartbeat_reflection",
      content:
        `## Heartbeat reflection\n\n` +
        `- status: ${status}${durationLine}${issueRef}\n\n` +
        `Auto-templated reflection. M2 Group 2 will replace this with a Haiku-built note.`,
    };
  }
}
```

`packages/reflector/src/reflector.ts`:

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

## 6. `createReflector`

`server/src/composition/reflector.ts`:

```ts
import { Reflector, type NotesSink } from "@petagent/reflector";
import { NotesManager, EmbeddingService } from "@petagent/skills";
import { GitStore } from "@petagent/safety-net";
import type { HookBus } from "@petagent/hooks";
import type { Db } from "@petagent/db";
import type { Config } from "../config.js";

export interface ReflectorFactoryDeps {
  db: Db;
  hookBus: HookBus;
  config: Config;
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
        sourceIssueId: args.sourceIssueId ?? undefined,
        noteType: args.noteType,
      });
      return { id: note.id };
    },
  };
  const reflector = new Reflector({ bus: deps.hookBus, notesSink: sink, logger: deps.logger });
  return reflector;
}
```

## 7. `live-events.ts` heartbeat-end mapping

Existing `normalizeEventType` returns `null` for `heartbeat.run.status`. Replace with:

```ts
case "heartbeat.run.status": {
  const status = (paperclipPayload as { status?: unknown } | undefined)?.status;
  if (typeof status === "string" && TERMINAL_STATUSES.has(status)) {
    return "heartbeat.ended";
  }
  return null;
}
```

`TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "timed_out"])`. This requires `forwardToHookBus` to pass the payload to `normalizeEventType` (currently it doesn't); the implementation widens the helper signature.

## 8. Config additions

Three new fields on `Config` (`server/src/config.ts`):

```ts
psychologistEnabled: boolean;             // env PETAGENT_PSYCHOLOGIST_ENABLED
reflectorEnabled: boolean;                // env PETAGENT_REFLECTOR_ENABLED
notesGitStoreDir: string;                 // env PETAGENT_NOTES_GIT_STORE_DIR; default `<storageLocalDiskBaseDir>/notes-store`
```

Defaults: both `Enabled` flags **false** (no behavior change for existing deployments). `notesGitStoreDir` derived only when reflector is enabled and the env is unset.

## 9. `app.ts` startup wiring

After `bridgeHookBusToNotifications({ bus: globalHookBus, store: notificationStore });`:

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

Stop hooks are not registered for this milestone — process exit kills the bus anyway. Fine for the preview.

## 10. UI `/notes` page

`ui/src/pages/Notes.tsx` (~150 lines, modeled on `Roles.tsx`):

- Header (`<PageHeader title="Notes" subtitle="Recent notes left by agents." />`)
- Filter row: agent dropdown, scope select, search input, [Search] button
- Body: vertical list of `<NoteCard>` items showing `id [scope] · timestamp · agent · noteType` plus the body content
- Empty state: "No notes yet. Start the Reflector and run an agent."
- Loading: skeleton rows

Data:
- On mount and on filter change with empty query → `GET /api/companies/:cid/agents/:aid/notes?scope=&limit=50`
- Non-empty query → `GET /api/companies/:cid/agents/:aid/notes/search?q=&topK=20&scope=`
- `cid` from current company context (existing hook), `aid` from dropdown
- Agents list from existing `GET /api/companies/:cid/agents`

`App.tsx`:

```tsx
<Route path="notes" element={<Notes />} />
```

Sidebar nav: link added to whichever sidebar component lists `/interventions` and `/roles`. Inspection during implementation will confirm.

## 11. Testing

| File | Cases |
|---|---|
| `packages/psychologist/src/__tests__/behavioral_passthrough.test.ts` | classify returns mild + signals + distress |
| `packages/reflector/src/__tests__/templated_builder.test.ts` | builder shape: with status / with duration / with no payload |
| `packages/reflector/src/__tests__/reflector.test.ts` | filter only heartbeat.ended / sink called with full args / cooldown gate / sink failure swallowed / scope override |
| `server/src/__tests__/live-events-heartbeat-ended.test.ts` | terminal status → emits heartbeat.ended on bus / non-terminal status emits nothing |
| `server/src/__tests__/composition-psychologist.test.ts` | disabled returns null / no-key uses passthrough / with-key uses prompted |
| `server/src/__tests__/composition-reflector.test.ts` | disabled null / enabled wires NotesManager-backed sink |
| `ui/src/pages/__tests__/Notes.test.tsx` | renders list / switches to search on query input / scope filter param |

~18 new unit tests. Type-check: server + ui + packages/* all clean. Full vitest: green except known M0 environmental flakes.

## 12. Out of scope

- Real Reflector LLM (M2 Task 7).
- Anthropic key in `SecretsService` (env-only for this preview).
- Notes UI mutate operations (agent-only authorship is the design).
- Psychologist explicit dialogue mode (spec §7.4 "@mention me").
- KPI / SkillMiner / Shadow / Auto-rollback (M2 Groups 4–7).
- Stop/teardown hooks for Psychologist / Reflector (process exit suffices for preview).
- Reflector cooldown across process restarts (in-memory only is fine for preview).

## 13. Tag

`v0.3.0-m2-preview` once all tasks land + typecheck + vitest pass.

## 14. User experience smoke

After this milestone, the user can:

1. `pnpm dev` (or run the binary) with env:
   ```
   PETAGENT_PSYCHOLOGIST_ENABLED=true
   PETAGENT_REFLECTOR_ENABLED=true
   ```
2. Hire an agent via existing `/board` UI, assign it some work.
3. Watch the Activity / heartbeat run finish; `[petagent] reflector started` appears in server logs.
4. Open `/notes` — see the heartbeat reflection note appear.
5. If the agent's behavior trips the monitor (consecutive failures, output collapse, etc.), `/interventions` shows the incident and the agent's instructions bundle gets `psychologist-injection.md` written.

Without `ANTHROPIC_API_KEY`, classifier is passthrough — Psych still fires on real behavioral signals but skips the LLM. With the key set on next start, the classifier upgrades transparently.
