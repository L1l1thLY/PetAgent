# Psychologist Actions Wiring (#1d)

## Context

`@petagent/psychologist` defines a port-and-adapter `PsychologistActions` interface with four methods (`injectInstructions`, `postBoardComment`, `pauseIssue`, `splitIssue`) plus a `CapabilitiesProvider` port. M1 shipped the package with in-memory fakes for tests. Concrete server-side implementations were deferred as wiring item #1d in the post-M1 pass.

`#1a`–`#1c` already shipped concrete drizzle stores and the Anthropic HTTP classifier transport. Once `#1d` lands, the full Psychologist loop becomes runnable end-to-end and Group 9 Task 50's synthetic smoke test can be upgraded to a real E2E.

Spec references:
- `2026-04-17-petagent-platform-design.md` §7.3 (intervention tiers + γ transparency rule)
- `2026-04-17-petagent-platform-design.md` §3.4 (capabilities table — wired via `BUILTIN_ADAPTER_CAPABILITIES`)

---

## 1. Architecture

Concrete implementations live under `server/src/psychologist/` next to the existing `#1a`/`#1b`/`#1c` files. They consume the existing service layer (`issueService`, `agentInstructionsService`) rather than touching drizzle directly. This:

- preserves status-transition validation, redaction, live-event emission, hook bus side effects, and the new NotificationStore bridge
- avoids duplicating logic that is already covered by route-level integration tests
- keeps the domain package (`@petagent/psychologist`) free of `@petagent/db` and `@petagent/server` imports, which is the M1 design constraint

New files:

```
server/src/psychologist/
  psych_capability_registry.ts        # adapter → psychologist AdapterCapabilities map
  drizzle_capabilities_provider.ts    # CapabilitiesProvider impl
  service_psychologist_actions.ts     # PsychologistActions impl
server/src/__tests__/
  psych-capability-registry.test.ts
  drizzle-capabilities-provider.test.ts
  service-psychologist-actions.test.ts
```

Touched files:

- `server/src/config.ts` — new optional `psychologistActorAgentId` (env `PETAGENT_PSYCHOLOGIST_ACTOR_AGENT_ID`)
- `packages/psychologist/src/m1-composition.test.ts` — append one server-stack E2E case

No barrel `index.ts` is added; consumers import the concrete files directly, matching the `#1a`/`#1b`/`#1c` convention.

Not touched:

- `@petagent/psychologist` package (port interfaces are stable)
- Existing route handlers (no new HTTP endpoints introduced)

## 2. `ServicePsychologistActions`

Implements `PsychologistActions` from `@petagent/psychologist`. Constructed with:

```ts
interface ServicePsychologistActionsDeps {
  db: Db;
  issueService: ReturnType<typeof issueService>;
  agentInstructions: ReturnType<typeof agentInstructionsService>;
  systemActorAgentId?: string | null;        // optional, default null
  injectionFileName?: string;                // default "psychologist-injection.md"
  pauseAuditMessage?: string;                // default "Paused for therapy session."
  splitAuditMessageTemplate?: (childIdentifier: string, reason: string) => string;
                                             // default: `"Recommended split into ${childIdentifier}: ${reason}"`
  logger?: { warn(msg: string, meta?: unknown): void };
}
```

### `injectInstructions(agentId, content)`

1. `SELECT * FROM agents WHERE id = $1` (agentInstructionsService.writeFile takes an `AgentLike` row, not an id).
2. Call `agentInstructions.writeFile(agentRow, injectionFileName, content)`.
3. Bundle is overwritten on each call (γ-opaque, one-shot semantics aligned with spec §7.3 mild). Agent reads it on next heartbeat through the existing bundle loader.
4. Defensive: if agent is missing or the adapter does not support the bundle, log a warning and return — the dispatcher already gates this on `supportsInstructionsBundle`, so this path is only a safety net.

(Audit-log emission for instruction injects lives at the route layer today; replicating it inside this action is out of scope and tracked separately.)

### `postBoardComment(agentId, content)`

1. `findActiveIssueForAgent(agentId)`:
   ```sql
   SELECT id, companyId
   FROM issues
   WHERE assigneeAgentId = $1 AND status = 'in_progress'
   ORDER BY updatedAt DESC LIMIT 1
   ```
2. No active issue → log warn and return (no-op). The Psychologist often fires immediately after a heartbeat ends, so this is expected and must not surface as an error.
3. With an active issue → `issueService.addComment(issueId, content, { agentId: deps.systemActorAgentId ?? undefined, runId: null })`.

### `pauseIssue(agentId)`

1. Same active-issue lookup.
2. `issueService.update(issueId, { status: "blocked", actorAgentId: deps.systemActorAgentId ?? null })`.
   - The service layer clears `checkoutRunId`, `executionRunId`, `executionAgentNameKey`, and `executionLockedAt` automatically when status leaves `in_progress` (see `services/issues.ts:1679-1685`).
3. Add an audit comment using `deps.pauseAuditMessage` (default `"Paused for therapy session."`). The dispatcher contract for `pauseIssue(agentId)` does not pass `content`, so this string is owned by the actions implementation, not the dispatcher.
4. If `assertTransition` rejects (issue already terminal), catch the `unprocessable` error and degrade to a comment-only path. Do not surface the error.

### `splitIssue(agentId, reason)`

1. Active-issue lookup, capturing `companyId`, `parentId = activeIssue.id`, `projectId`, `goalId`.
2. `issueService.create(companyId, { title: truncate(reason, 120), description: reason, parentId, projectId, goalId, status: "todo" })` with **no assignee** (board/manager picks).
3. Add an audit comment to the original issue using `deps.splitAuditMessageTemplate(childIdentifier, reason)` (default `"Recommended split into ${childIdentifier}: ${reason}"`).
4. The original issue stays `in_progress`. We do not auto-block it on the child.

## 3. `DrizzleCapabilitiesProvider`

Implements `CapabilitiesProvider` from `@petagent/psychologist`.

The psychologist's `AdapterCapabilities` (4 boolean fields below) is a separate concern from `@petagent/my-agent-adapter`'s `AdapterCapability` (which only carries `selfReviewsImplementation` for the Coordinator's Reviewer-skip routing). To avoid cross-contaminating the Coordinator capability schema, we ship a **psych-local registry** colocated with this provider:

```ts
// server/src/psychologist/psych_capability_registry.ts

import type { AdapterCapabilities } from "@petagent/psychologist";

export const PSYCH_CAPABILITY_DEFAULTS: Readonly<Record<string, AdapterCapabilities>> = Object.freeze({
  // PetAgent native workers — strong intervention (all four levels per spec §7.5)
  petagent: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: true,
    supportsIssueSplit: true,
  },
  // External Claude-Code-family adapters with managed instructions bundles —
  // mild + moderate only per spec §7.5. Severe intervention (pause/split) is
  // reserved for petagent-native agents to avoid surprising external runtimes.
  claude_local:   { supportsInstructionsBundle: true,  supportsBoardComment: true, supportsIssuePause: false, supportsIssueSplit: false },
  codex_local:    { supportsInstructionsBundle: true,  supportsBoardComment: true, supportsIssuePause: false, supportsIssueSplit: false },
  cursor:         { supportsInstructionsBundle: true,  supportsBoardComment: true, supportsIssuePause: false, supportsIssueSplit: false },
  opencode_local: { supportsInstructionsBundle: true,  supportsBoardComment: true, supportsIssuePause: false, supportsIssueSplit: false },
  gemini_local:   { supportsInstructionsBundle: true,  supportsBoardComment: true, supportsIssuePause: false, supportsIssueSplit: false },
  hermes_local:   { supportsInstructionsBundle: true,  supportsBoardComment: true, supportsIssuePause: false, supportsIssueSplit: false },
});

// Fallback for any adapter not listed: only Board Comment (any adapter can
// receive comments — they're a UI artifact, not an adapter feature).
export const PSYCH_CAPABILITY_FALLBACK: AdapterCapabilities = Object.freeze({
  supportsInstructionsBundle: false,
  supportsBoardComment: true,
  supportsIssuePause: false,
  supportsIssueSplit: false,
});
```

```ts
// server/src/psychologist/drizzle_capabilities_provider.ts

interface DrizzleCapabilitiesProviderDeps {
  db: Db;
  defaults?: Readonly<Record<string, AdapterCapabilities>>; // default PSYCH_CAPABILITY_DEFAULTS
  fallback?: AdapterCapabilities;                            // default PSYCH_CAPABILITY_FALLBACK
}
```

`forAgent(agentId)`:

1. `SELECT adapterType FROM agents WHERE id = $1`.
2. Look up `defaults[adapterType]`. Found → return that record.
3. Unknown adapter → return `fallback` (Board Comment only).
4. Missing agent (no row) → return all-false (most conservative; not even Board Comment, since we have no issue context).

## 4. Error Handling

- All four actions wrap in try/catch and **never throw**. The dispatcher already records `succeeded: boolean` in the incident; thrown errors would break `incidents.insert` downstream and orphan the run.
- "no active issue" is normal post-heartbeat state, so it is `logger.warn` only.
- Service-level validation errors (transition rejection, missing project, etc.) degrade to comment-only and log.

## 5. Testing

### `service_psychologist_actions.test.ts` (10–12 cases)

Pure unit tests with fake `issueService`/`agentInstructions` recorders.

- `injectInstructions` calls `writeFile` once with the configured filename
- `postBoardComment` finds the active issue and calls `addComment` with the configured actor
- `pauseIssue` calls `update({status:"blocked"})` and adds the audit comment
- `splitIssue` calls `create` with parentId/projectId/goalId and adds an audit comment on the original
- No-active-issue path: warn and no-op (no throw)
- `assertTransition` failure on `pauseIssue` → degrades to comment-only
- `systemActorAgentId` injected vs. default-null: both author paths work

### `psych-capability-registry.test.ts` (3–4 cases)

- `petagent` defaults grant all four capabilities
- `claude_local` defaults grant `supportsInstructionsBundle` + `supportsBoardComment`, deny pause/split
- `PSYCH_CAPABILITY_FALLBACK` grants only `supportsBoardComment`

### `drizzle-capabilities-provider.test.ts` (4–5 cases, structural)

- Known adapters (`petagent`, `claude_local`, `cursor`) map to their registry record
- Unknown adapter → returns `PSYCH_CAPABILITY_FALLBACK` (Board Comment only)
- Missing agent → returns all-false (no fallback)
- Override `defaults` constructor option flows through

### `m1-composition.test.ts` (append one case)

Wire the new server-side stack against an embedded postgres + the real `issueService`/`agentInstructionsService`. Run a full `mild → moderate → severe` chain and assert that:

- The injection file is written on the agent's bundle
- A comment exists on the active issue with the configured actor
- After the severe pause, issue status is `blocked` and `checkoutRunId` is null
- An incident row exists with the correct `interventionKind` for each stage

This case is the seed for upgrading Group 9 Task 50's synthetic smoke test to a real E2E.

## 6. Composition Point

Wire in `server/src/app.ts` (or the equivalent `createApp` factory) alongside the existing `globalHookBus`/`db` wiring:

```ts
const psychActions = new ServicePsychologistActions({
  db,
  issueService: issueServiceInstance,
  agentInstructions: agentInstructionsServiceInstance,
  systemActorAgentId: config.psychologistActorAgentId ?? null,
  logger: console,
});
const psychCapabilities = new DrizzleCapabilitiesProvider({ db });
```

The `Psychologist` instance itself is **not** auto-started by `createApp`. We follow the same convention used by `#7 budget-check routine`: expose a factory and let deployment decide whether to start it. Auto-start is a follow-up.

## 7. Out of Scope

- LLM-rewritten intervention content (M2)
- `@mention` parsing for the explicit dialogue mode (spec §7.4 second clause)
- Email/Slack delivery of psychologist comments (existing `NotificationStore` covers in-app notifications)
- Killing in-flight agent runs at the supervisor level (`pauseIssue` only clears the checkout; supervisor reacts on the next tick)
- Drizzle-only fast path that skips the service layer

## 8. Ticket Linkage

Closes wiring item #1d in the post-M1 pass. Unblocks the Psychologist E2E upgrade for Group 9 Task 50.
