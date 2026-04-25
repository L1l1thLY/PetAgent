# Psychologist Actions Wiring (#1d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement concrete `PsychologistActions` and `CapabilitiesProvider` for the M1 Psychologist runtime, plus the per-adapter capability registry, so the full mild→moderate→severe loop runs against real `issueService` / `agentInstructionsService` / postgres state.

**Architecture:** Service-layer seam. `ServicePsychologistActions` consumes `issueService(db)` and `agentInstructionsService()` rather than touching drizzle directly, so status-transition validation, redaction, live events, and the NotificationStore bridge keep working. `DrizzleCapabilitiesProvider` reads `agents.adapterType` and looks the agent up in a psych-local capability registry. None of these changes touch `@petagent/psychologist` itself; the package's port interfaces are stable.

**Tech Stack:** TypeScript, vitest, drizzle-orm, `@petagent/db`, `@petagent/psychologist`.

**Spec:** `docs/specs/2026-04-25-psychologist-actions-wiring-design.md`

---

## File Map

**New files:**

| Path | Responsibility |
|---|---|
| `server/src/psychologist/psych_capability_registry.ts` | Static map: adapter type → `AdapterCapabilities`. Plus a Board-Comment-only fallback constant. No DB. |
| `server/src/psychologist/drizzle_capabilities_provider.ts` | `CapabilitiesProvider` impl: SELECT adapterType, look up registry, return capabilities. |
| `server/src/psychologist/service_psychologist_actions.ts` | `PsychologistActions` impl: 4 methods, never throws, uses injected `issueService` + `agentInstructionsService`. Owns the active-issue lookup helper. |
| `server/src/__tests__/psych-capability-registry.test.ts` | Unit tests for the registry constants. |
| `server/src/__tests__/drizzle-capabilities-provider.test.ts` | Structural unit tests with a fake `db.select(...)`. |
| `server/src/__tests__/service-psychologist-actions.test.ts` | Pure unit tests with fake `issueService` + `agentInstructions` recorders. |
| `server/src/__tests__/psychologist-server-stack.test.ts` | Composition test wiring the package-level `InterventionDispatcher` against the new server-side concretes (in-memory fakes for db/issueService/agentInstructions). |

**Modified files:**

| Path | Change |
|---|---|
| `server/src/config.ts` | Add `psychologistActorAgentId: string \| null` field, env `PETAGENT_PSYCHOLOGIST_ACTOR_AGENT_ID`. |

---

## Task 1: Psychologist capability registry

**Files:**
- Create: `server/src/psychologist/psych_capability_registry.ts`
- Test: `server/src/__tests__/psych-capability-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/__tests__/psych-capability-registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PSYCH_CAPABILITY_DEFAULTS,
  PSYCH_CAPABILITY_FALLBACK,
} from "../psychologist/psych_capability_registry.js";

describe("PSYCH_CAPABILITY_DEFAULTS", () => {
  it("grants all four capabilities to petagent-native workers", () => {
    expect(PSYCH_CAPABILITY_DEFAULTS.petagent).toEqual({
      supportsInstructionsBundle: true,
      supportsBoardComment: true,
      supportsIssuePause: true,
      supportsIssueSplit: true,
    });
  });

  it("grants bundle + comment but denies pause/split for claude_local", () => {
    expect(PSYCH_CAPABILITY_DEFAULTS.claude_local).toEqual({
      supportsInstructionsBundle: true,
      supportsBoardComment: true,
      supportsIssuePause: false,
      supportsIssueSplit: false,
    });
  });

  it("covers the same external adapters the platform ships", () => {
    for (const key of [
      "claude_local",
      "codex_local",
      "cursor",
      "opencode_local",
      "gemini_local",
      "hermes_local",
    ]) {
      const record = PSYCH_CAPABILITY_DEFAULTS[key];
      expect(record, `missing entry for ${key}`).toBeDefined();
      expect(record.supportsInstructionsBundle).toBe(true);
      expect(record.supportsBoardComment).toBe(true);
      expect(record.supportsIssuePause).toBe(false);
      expect(record.supportsIssueSplit).toBe(false);
    }
  });
});

describe("PSYCH_CAPABILITY_FALLBACK", () => {
  it("only allows board comments by default", () => {
    expect(PSYCH_CAPABILITY_FALLBACK).toEqual({
      supportsInstructionsBundle: false,
      supportsBoardComment: true,
      supportsIssuePause: false,
      supportsIssueSplit: false,
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run server/src/__tests__/psych-capability-registry.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the registry**

Create `server/src/psychologist/psych_capability_registry.ts`:

```ts
/**
 * Psychologist-side adapter capability defaults (spec §7.5).
 *
 * Distinct from `@petagent/my-agent-adapter`'s `BUILTIN_ADAPTER_CAPABILITIES`,
 * which carries Coordinator routing flags only (`selfReviewsImplementation`).
 * Conflating the two would couple the Coordinator's reviewer-skip routing
 * to the Psychologist's intervention tier, which spec §3.4 and §7.5 keep
 * separate on purpose.
 */

import type { AdapterCapabilities } from "@petagent/psychologist";

export const PSYCH_CAPABILITY_DEFAULTS: Readonly<Record<string, AdapterCapabilities>> = Object.freeze({
  petagent: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: true,
    supportsIssueSplit: true,
  },
  claude_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  codex_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  cursor: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  opencode_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  gemini_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
  hermes_local: {
    supportsInstructionsBundle: true,
    supportsBoardComment: true,
    supportsIssuePause: false,
    supportsIssueSplit: false,
  },
});

export const PSYCH_CAPABILITY_FALLBACK: AdapterCapabilities = Object.freeze({
  supportsInstructionsBundle: false,
  supportsBoardComment: true,
  supportsIssuePause: false,
  supportsIssueSplit: false,
});
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run server/src/__tests__/psych-capability-registry.test.ts`

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/psychologist/psych_capability_registry.ts \
        server/src/__tests__/psych-capability-registry.test.ts
git commit -m "$(cat <<'EOF'
feat(m1+,server): wiring #1d — psych capability registry

Static map of adapter type → AdapterCapabilities for the Psychologist's
intervention tier (spec §7.5). Kept separate from the Coordinator's
BUILTIN_ADAPTER_CAPABILITIES to avoid coupling reviewer-skip routing to
intervention tiering.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 2: `DrizzleCapabilitiesProvider`

**Files:**
- Create: `server/src/psychologist/drizzle_capabilities_provider.ts`
- Test: `server/src/__tests__/drizzle-capabilities-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/__tests__/drizzle-capabilities-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DrizzleCapabilitiesProvider } from "../psychologist/drizzle_capabilities_provider.js";
import {
  PSYCH_CAPABILITY_DEFAULTS,
  PSYCH_CAPABILITY_FALLBACK,
} from "../psychologist/psych_capability_registry.js";

function makeFakeDb(rows: Array<{ adapterType: string }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  } as unknown as import("@petagent/db").Db;
}

describe("DrizzleCapabilitiesProvider.forAgent", () => {
  it("returns the registry record for a known adapter", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([{ adapterType: "petagent" }]),
    });
    const caps = await provider.forAgent("agent-1");
    expect(caps).toEqual(PSYCH_CAPABILITY_DEFAULTS.petagent);
  });

  it("returns fallback (Board Comment only) for an unknown adapter", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([{ adapterType: "imaginary_adapter" }]),
    });
    const caps = await provider.forAgent("agent-1");
    expect(caps).toEqual(PSYCH_CAPABILITY_FALLBACK);
  });

  it("returns all-false when the agent row is missing", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([]),
    });
    const caps = await provider.forAgent("ghost");
    expect(caps).toEqual({
      supportsInstructionsBundle: false,
      supportsBoardComment: false,
      supportsIssuePause: false,
      supportsIssueSplit: false,
    });
  });

  it("honors a custom defaults map", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([{ adapterType: "synthetic" }]),
      defaults: {
        synthetic: {
          supportsInstructionsBundle: true,
          supportsBoardComment: true,
          supportsIssuePause: true,
          supportsIssueSplit: true,
        },
      },
    });
    const caps = await provider.forAgent("agent-1");
    expect(caps.supportsIssuePause).toBe(true);
  });

  it("honors a custom fallback", async () => {
    const provider = new DrizzleCapabilitiesProvider({
      db: makeFakeDb([{ adapterType: "imaginary_adapter" }]),
      fallback: {
        supportsInstructionsBundle: false,
        supportsBoardComment: false,
        supportsIssuePause: false,
        supportsIssueSplit: true,
      },
    });
    const caps = await provider.forAgent("agent-1");
    expect(caps.supportsIssueSplit).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run server/src/__tests__/drizzle-capabilities-provider.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the provider**

Create `server/src/psychologist/drizzle_capabilities_provider.ts`:

```ts
/**
 * Drizzle-backed `CapabilitiesProvider` for the Psychologist (#1d).
 *
 * Resolves an agent's intervention-tier capabilities by:
 *   1. Reading `agents.adapterType`.
 *   2. Looking the type up in `PSYCH_CAPABILITY_DEFAULTS`.
 *   3. Falling back to `PSYCH_CAPABILITY_FALLBACK` (Board Comment only)
 *      for unknown adapters, or all-false if the row is missing.
 *
 * Lives in the server package to keep `@petagent/psychologist` free of
 * `@petagent/db` imports (Group 7 design rule).
 */

import { eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agents } from "@petagent/db";
import type { AdapterCapabilities, CapabilitiesProvider } from "@petagent/psychologist";
import {
  PSYCH_CAPABILITY_DEFAULTS,
  PSYCH_CAPABILITY_FALLBACK,
} from "./psych_capability_registry.js";

const ALL_FALSE: AdapterCapabilities = Object.freeze({
  supportsInstructionsBundle: false,
  supportsBoardComment: false,
  supportsIssuePause: false,
  supportsIssueSplit: false,
});

export interface DrizzleCapabilitiesProviderDeps {
  db: Db;
  defaults?: Readonly<Record<string, AdapterCapabilities>>;
  fallback?: AdapterCapabilities;
}

export class DrizzleCapabilitiesProvider implements CapabilitiesProvider {
  private readonly db: Db;
  private readonly defaults: Readonly<Record<string, AdapterCapabilities>>;
  private readonly fallback: AdapterCapabilities;

  constructor(deps: DrizzleCapabilitiesProviderDeps) {
    this.db = deps.db;
    this.defaults = deps.defaults ?? PSYCH_CAPABILITY_DEFAULTS;
    this.fallback = deps.fallback ?? PSYCH_CAPABILITY_FALLBACK;
  }

  async forAgent(agentId: string): Promise<AdapterCapabilities> {
    const rows = await this.db
      .select({ adapterType: agents.adapterType })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    const row = rows[0];
    if (!row) return ALL_FALSE;
    return this.defaults[row.adapterType] ?? this.fallback;
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run server/src/__tests__/drizzle-capabilities-provider.test.ts`

Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/psychologist/drizzle_capabilities_provider.ts \
        server/src/__tests__/drizzle-capabilities-provider.test.ts
git commit -m "$(cat <<'EOF'
feat(m1+,server): wiring #1d — DrizzleCapabilitiesProvider

CapabilitiesProvider impl backed by `agents.adapterType`. Looks the type
up in PSYCH_CAPABILITY_DEFAULTS, falls back to PSYCH_CAPABILITY_FALLBACK
(Board Comment only) for unknown adapters, returns all-false for
missing-agent rows.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 3: `ServicePsychologistActions` skeleton + `injectInstructions`

**Files:**
- Create: `server/src/psychologist/service_psychologist_actions.ts`
- Test: `server/src/__tests__/service-psychologist-actions.test.ts`

The implementation grows method-by-method across Tasks 3–6 in TDD style. This task adds the constructor, deps shape, the active-issue lookup helper, and `injectInstructions` only.

- [ ] **Step 1: Write the failing tests**

Create `server/src/__tests__/service-psychologist-actions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ServicePsychologistActions } from "../psychologist/service_psychologist_actions.js";

interface AgentRow {
  id: string;
  companyId: string;
  name: string;
  adapterConfig: Record<string, unknown>;
}

interface IssueRow {
  id: string;
  companyId: string;
  status: string;
  assigneeAgentId: string | null;
  projectId: string | null;
  goalId: string | null;
  updatedAt: Date;
}

interface CommentRecord {
  issueId: string;
  body: string;
  agentId?: string;
  userId?: string;
  runId: string | null;
}

interface IssueCreateInput {
  title: string;
  description?: string;
  parentId?: string;
  projectId?: string | null;
  goalId?: string | null;
  status?: string;
}

class FakeIssueService {
  comments: CommentRecord[] = [];
  updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  created: Array<{ companyId: string; data: IssueCreateInput }> = [];
  forceTransitionRejection = false;

  constructor(private readonly issues: IssueRow[]) {}

  async addComment(issueId: string, body: string, actor: { agentId?: string; userId?: string; runId?: string | null }) {
    this.comments.push({ issueId, body, agentId: actor.agentId, userId: actor.userId, runId: actor.runId ?? null });
    return { id: `c-${this.comments.length}`, body };
  }

  async update(id: string, data: Record<string, unknown>) {
    if (this.forceTransitionRejection && data.status && data.status !== "in_progress") {
      const err = new Error("Invalid status transition");
      (err as Error & { statusCode?: number }).statusCode = 422;
      throw err;
    }
    this.updates.push({ id, data });
    const existing = this.issues.find((i) => i.id === id);
    if (!existing) return null;
    return { ...existing, ...data };
  }

  async create(companyId: string, data: IssueCreateInput) {
    this.created.push({ companyId, data });
    const newId = `new-${this.created.length}`;
    return { id: newId, identifier: `NEW-${this.created.length}`, companyId, ...data };
  }
}

class FakeAgentInstructions {
  writes: Array<{ agentId: string; relativePath: string; content: string }> = [];
  async writeFile(
    agent: AgentRow,
    relativePath: string,
    content: string,
  ) {
    this.writes.push({ agentId: agent.id, relativePath, content });
    return { bundle: {}, file: {}, adapterConfig: {} } as unknown;
  }
}

interface FakeDeps {
  agents: AgentRow[];
  issues: IssueRow[];
}

function makeFakeDb(state: FakeDeps) {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: (table: { _: { name?: string } } & Record<string, unknown>) => ({
        where: () => ({
          limit: async () => {
            // crude: route by which column set was selected
            if (cols && "adapterConfig" in cols) {
              return state.agents;
            }
            return state.issues;
          },
          orderBy: () => ({
            limit: async () => state.issues,
          }),
        }),
      }),
    }),
  } as unknown as import("@petagent/db").Db;
}

const makeWarnLogger = () => {
  const warnings: Array<{ msg: string; meta?: unknown }> = [];
  return {
    logger: { warn: (msg: string, meta?: unknown) => warnings.push({ msg, meta }) },
    warnings,
  };
};

const makeAgent = (overrides: Partial<AgentRow> = {}): AgentRow => ({
  id: "agent-1",
  companyId: "co-1",
  name: "Sigmund",
  adapterConfig: {},
  ...overrides,
});

const makeIssue = (overrides: Partial<IssueRow> = {}): IssueRow => ({
  id: "issue-1",
  companyId: "co-1",
  status: "in_progress",
  assigneeAgentId: "agent-1",
  projectId: "proj-1",
  goalId: "goal-1",
  updatedAt: new Date("2026-04-25T00:00:00Z"),
  ...overrides,
});

describe("ServicePsychologistActions.injectInstructions", () => {
  it("writes the configured filename with the provided content", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const { logger } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await actions.injectInstructions("agent-1", "Take a deep breath.");
    expect(agentInstructions.writes).toEqual([
      { agentId: "agent-1", relativePath: "psychologist-injection.md", content: "Take a deep breath." },
    ]);
  });

  it("respects an injected injectionFileName", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      injectionFileName: "custom/path.md",
    });
    await actions.injectInstructions("agent-1", "hi");
    expect(agentInstructions.writes[0].relativePath).toBe("custom/path.md");
  });

  it("warns and no-ops when the agent is missing", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await expect(actions.injectInstructions("ghost", "x")).resolves.toBeUndefined();
    expect(agentInstructions.writes).toEqual([]);
    expect(warnings.length).toBe(1);
  });

  it("does not throw when writeFile rejects", async () => {
    const issueService = new FakeIssueService([]);
    const failing = new FakeAgentInstructions();
    failing.writeFile = async () => {
      throw new Error("disk full");
    };
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: failing as unknown as never,
      logger,
    });
    await expect(actions.injectInstructions("agent-1", "x")).resolves.toBeUndefined();
    expect(warnings.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run server/src/__tests__/service-psychologist-actions.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the skeleton + `injectInstructions`**

Create `server/src/psychologist/service_psychologist_actions.ts`:

```ts
/**
 * Concrete `PsychologistActions` impl (#1d, spec §7.3).
 *
 * Calls into the existing service layer (`issueService`,
 * `agentInstructionsService`) rather than touching drizzle directly so
 * the side effects route handlers depend on (status-transition
 * validation, redaction, live-event emission, NotificationStore bridge)
 * keep working when the Psychologist intervenes.
 *
 * All four methods catch their errors and never throw — the dispatcher
 * already records `succeeded: boolean` on the incident, and a thrown
 * error in here would orphan that incident write upstream in
 * Psychologist.onEvent.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agents, issues } from "@petagent/db";
import type { PsychologistActions } from "@petagent/psychologist";

const DEFAULT_INJECTION_FILENAME = "psychologist-injection.md";
const DEFAULT_PAUSE_MESSAGE = "Paused for therapy session.";
const DEFAULT_SPLIT_TEMPLATE = (childIdentifier: string, reason: string): string =>
  `Recommended split into ${childIdentifier}: ${reason}`;

type Logger = { warn(msg: string, meta?: unknown): void };

interface AgentRow {
  id: string;
  companyId: string;
  name: string;
  adapterConfig: unknown;
}

interface ActiveIssueRow {
  id: string;
  companyId: string;
  projectId: string | null;
  goalId: string | null;
}

interface FakeableIssueService {
  addComment(
    issueId: string,
    body: string,
    actor: { agentId?: string; userId?: string; runId?: string | null },
  ): Promise<unknown>;
  update(
    id: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  create(
    companyId: string,
    data: {
      title: string;
      description?: string;
      parentId?: string;
      projectId?: string | null;
      goalId?: string | null;
      status?: string;
    },
  ): Promise<{ id: string; identifier?: string }>;
}

interface FakeableAgentInstructions {
  writeFile(
    agent: AgentRow,
    relativePath: string,
    content: string,
  ): Promise<unknown>;
}

export interface ServicePsychologistActionsDeps {
  db: Db;
  issueService: FakeableIssueService;
  agentInstructions: FakeableAgentInstructions;
  systemActorAgentId?: string | null;
  injectionFileName?: string;
  pauseAuditMessage?: string;
  splitAuditMessageTemplate?: (childIdentifier: string, reason: string) => string;
  logger?: Logger;
}

export class ServicePsychologistActions implements PsychologistActions {
  private readonly db: Db;
  private readonly issueService: FakeableIssueService;
  private readonly agentInstructions: FakeableAgentInstructions;
  private readonly systemActorAgentId: string | null;
  private readonly injectionFileName: string;
  private readonly pauseAuditMessage: string;
  private readonly splitAuditMessageTemplate: (childIdentifier: string, reason: string) => string;
  private readonly logger: Logger;

  constructor(deps: ServicePsychologistActionsDeps) {
    this.db = deps.db;
    this.issueService = deps.issueService;
    this.agentInstructions = deps.agentInstructions;
    this.systemActorAgentId = deps.systemActorAgentId ?? null;
    this.injectionFileName = deps.injectionFileName ?? DEFAULT_INJECTION_FILENAME;
    this.pauseAuditMessage = deps.pauseAuditMessage ?? DEFAULT_PAUSE_MESSAGE;
    this.splitAuditMessageTemplate = deps.splitAuditMessageTemplate ?? DEFAULT_SPLIT_TEMPLATE;
    this.logger = deps.logger ?? { warn: () => {} };
  }

  async injectInstructions(agentId: string, content: string): Promise<void> {
    try {
      const agent = await this.findAgent(agentId);
      if (!agent) {
        this.logger.warn("psychologist.injectInstructions: agent not found", { agentId });
        return;
      }
      await this.agentInstructions.writeFile(agent, this.injectionFileName, content);
    } catch (err) {
      this.logger.warn("psychologist.injectInstructions failed", { agentId, err: String(err) });
    }
  }

  async postBoardComment(_agentId: string, _content: string): Promise<void> {
    // implemented in Task 4
    throw new Error("not yet implemented");
  }

  async pauseIssue(_agentId: string): Promise<void> {
    // implemented in Task 5
    throw new Error("not yet implemented");
  }

  async splitIssue(_agentId: string, _reason: string): Promise<void> {
    // implemented in Task 6
    throw new Error("not yet implemented");
  }

  private async findAgent(agentId: string): Promise<AgentRow | null> {
    const rows = await this.db
      .select({
        id: agents.id,
        companyId: agents.companyId,
        name: agents.name,
        adapterConfig: agents.adapterConfig,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    return (rows[0] as AgentRow | undefined) ?? null;
  }

  private async findActiveIssue(agentId: string): Promise<ActiveIssueRow | null> {
    const rows = await this.db
      .select({
        id: issues.id,
        companyId: issues.companyId,
        projectId: issues.projectId,
        goalId: issues.goalId,
      })
      .from(issues)
      .where(and(eq(issues.assigneeAgentId, agentId), eq(issues.status, "in_progress")))
      .orderBy(desc(issues.updatedAt))
      .limit(1);
    return (rows[0] as ActiveIssueRow | undefined) ?? null;
  }

  protected actorForComment(): { agentId?: string; userId?: string; runId: null } {
    if (this.systemActorAgentId) return { agentId: this.systemActorAgentId, runId: null };
    return { runId: null };
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run server/src/__tests__/service-psychologist-actions.test.ts`

Expected: PASS — the four `injectInstructions` tests pass. The other actions still throw "not yet implemented", but no test exercises them yet.

- [ ] **Step 5: Commit**

```bash
git add server/src/psychologist/service_psychologist_actions.ts \
        server/src/__tests__/service-psychologist-actions.test.ts
git commit -m "$(cat <<'EOF'
feat(m1+,server): wiring #1d — ServicePsychologistActions skeleton + injectInstructions

Adds the deps shape, agent + active-issue lookup helpers, and the
injectInstructions method (writes a single rolling file in the agent's
managed bundle via agentInstructionsService.writeFile). Errors are
caught and logged through the optional logger; the action never throws.

postBoardComment / pauseIssue / splitIssue still throw 'not yet
implemented' — those land in the next three commits.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 4: `ServicePsychologistActions.postBoardComment`

**Files:**
- Modify: `server/src/psychologist/service_psychologist_actions.ts`
- Modify: `server/src/__tests__/service-psychologist-actions.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `server/src/__tests__/service-psychologist-actions.test.ts`:

```ts
describe("ServicePsychologistActions.postBoardComment", () => {
  it("posts to the agent's active issue with the configured actor", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      systemActorAgentId: "psych-1",
    });
    await actions.postBoardComment("agent-1", "you are doing fine");
    expect(issueService.comments).toEqual([
      {
        issueId: "issue-1",
        body: "you are doing fine",
        agentId: "psych-1",
        userId: undefined,
        runId: null,
      },
    ]);
  });

  it("uses a system (no agent) actor when systemActorAgentId is unset", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
    });
    await actions.postBoardComment("agent-1", "hello");
    expect(issueService.comments[0].agentId).toBeUndefined();
  });

  it("warns and no-ops when there is no active issue", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await expect(actions.postBoardComment("agent-1", "hello")).resolves.toBeUndefined();
    expect(issueService.comments).toEqual([]);
    expect(warnings.length).toBe(1);
  });

  it("never throws when addComment rejects", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    issueService.addComment = async () => {
      throw new Error("network");
    };
    const agentInstructions = new FakeAgentInstructions();
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await expect(actions.postBoardComment("agent-1", "hello")).resolves.toBeUndefined();
    expect(warnings.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run server/src/__tests__/service-psychologist-actions.test.ts`

Expected: FAIL — `postBoardComment` throws "not yet implemented".

- [ ] **Step 3: Replace the placeholder with the real implementation**

In `server/src/psychologist/service_psychologist_actions.ts`, replace:

```ts
  async postBoardComment(_agentId: string, _content: string): Promise<void> {
    // implemented in Task 4
    throw new Error("not yet implemented");
  }
```

with:

```ts
  async postBoardComment(agentId: string, content: string): Promise<void> {
    try {
      const issue = await this.findActiveIssue(agentId);
      if (!issue) {
        this.logger.warn("psychologist.postBoardComment: no active issue", { agentId });
        return;
      }
      await this.issueService.addComment(issue.id, content, this.actorForComment());
    } catch (err) {
      this.logger.warn("psychologist.postBoardComment failed", { agentId, err: String(err) });
    }
  }
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run server/src/__tests__/service-psychologist-actions.test.ts`

Expected: PASS — `injectInstructions` (4) + `postBoardComment` (4) = 8 tests pass. `pauseIssue` / `splitIssue` placeholders still throw but no test calls them.

- [ ] **Step 5: Commit**

```bash
git add server/src/psychologist/service_psychologist_actions.ts \
        server/src/__tests__/service-psychologist-actions.test.ts
git commit -m "$(cat <<'EOF'
feat(m1+,server): wiring #1d — ServicePsychologistActions.postBoardComment

Looks up the agent's active issue (in_progress, most recently updated)
and posts the comment via issueService.addComment. systemActorAgentId
deps option attributes the comment to a configured agent identity;
otherwise the comment is system-authored (null author).

Errors and missing-active-issue both warn-and-return — psych must
never throw upstream into the dispatcher.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 5: `ServicePsychologistActions.pauseIssue`

**Files:**
- Modify: `server/src/psychologist/service_psychologist_actions.ts`
- Modify: `server/src/__tests__/service-psychologist-actions.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `server/src/__tests__/service-psychologist-actions.test.ts`:

```ts
describe("ServicePsychologistActions.pauseIssue", () => {
  it("PATCHes the active issue to blocked and posts the audit comment", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      systemActorAgentId: "psych-1",
    });
    await actions.pauseIssue("agent-1");
    expect(issueService.updates).toEqual([
      { id: "issue-1", data: { status: "blocked", actorAgentId: "psych-1" } },
    ]);
    expect(issueService.comments).toEqual([
      {
        issueId: "issue-1",
        body: "Paused for therapy session.",
        agentId: "psych-1",
        userId: undefined,
        runId: null,
      },
    ]);
  });

  it("respects an injected pauseAuditMessage", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      pauseAuditMessage: "deep breath",
    });
    await actions.pauseIssue("agent-1");
    expect(issueService.comments[0].body).toBe("deep breath");
  });

  it("degrades to comment-only when status transition is rejected", async () => {
    const issueService = new FakeIssueService([makeIssue({ status: "done" })]);
    issueService.forceTransitionRejection = true;
    const agentInstructions = new FakeAgentInstructions();
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue({ status: "done" })] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await actions.pauseIssue("agent-1");
    expect(issueService.comments.length).toBe(1);
    expect(warnings.length).toBe(1);
  });

  it("warns and no-ops when there is no active issue", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await expect(actions.pauseIssue("agent-1")).resolves.toBeUndefined();
    expect(issueService.updates).toEqual([]);
    expect(issueService.comments).toEqual([]);
    expect(warnings.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run server/src/__tests__/service-psychologist-actions.test.ts`

Expected: FAIL — `pauseIssue` throws "not yet implemented".

- [ ] **Step 3: Replace the placeholder with the real implementation**

In `server/src/psychologist/service_psychologist_actions.ts`, replace:

```ts
  async pauseIssue(_agentId: string): Promise<void> {
    // implemented in Task 5
    throw new Error("not yet implemented");
  }
```

with:

```ts
  async pauseIssue(agentId: string): Promise<void> {
    const issue = await this.findActiveIssue(agentId).catch(() => null);
    if (!issue) {
      this.logger.warn("psychologist.pauseIssue: no active issue", { agentId });
      return;
    }
    let transitioned = false;
    try {
      await this.issueService.update(issue.id, {
        status: "blocked",
        actorAgentId: this.systemActorAgentId,
      });
      transitioned = true;
    } catch (err) {
      this.logger.warn("psychologist.pauseIssue: status transition rejected, degrading to comment-only", {
        agentId,
        issueId: issue.id,
        err: String(err),
      });
    }
    try {
      await this.issueService.addComment(issue.id, this.pauseAuditMessage, this.actorForComment());
    } catch (err) {
      this.logger.warn("psychologist.pauseIssue: audit comment failed", {
        agentId,
        issueId: issue.id,
        transitioned,
        err: String(err),
      });
    }
  }
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run server/src/__tests__/service-psychologist-actions.test.ts`

Expected: PASS — 12 tests pass total (4 inject + 4 comment + 4 pause).

- [ ] **Step 5: Commit**

```bash
git add server/src/psychologist/service_psychologist_actions.ts \
        server/src/__tests__/service-psychologist-actions.test.ts
git commit -m "$(cat <<'EOF'
feat(m1+,server): wiring #1d — ServicePsychologistActions.pauseIssue

PATCHes the agent's active issue to status=blocked through
issueService.update (the service layer clears checkoutRunId /
executionRunId / executionLockedAt automatically when status leaves
in_progress), then adds an audit comment.

If the transition is rejected (issue already terminal), degrade to
comment-only and log. No-active-issue and audit-comment failures both
warn and return.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 6: `ServicePsychologistActions.splitIssue`

**Files:**
- Modify: `server/src/psychologist/service_psychologist_actions.ts`
- Modify: `server/src/__tests__/service-psychologist-actions.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `server/src/__tests__/service-psychologist-actions.test.ts`:

```ts
describe("ServicePsychologistActions.splitIssue", () => {
  it("creates a child issue inheriting parent / project / goal and adds an audit comment", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      systemActorAgentId: "psych-1",
    });
    await actions.splitIssue("agent-1", "Refactor the auth flow into a clean module");
    expect(issueService.created).toEqual([
      {
        companyId: "co-1",
        data: {
          title: "Refactor the auth flow into a clean module",
          description: "Refactor the auth flow into a clean module",
          parentId: "issue-1",
          projectId: "proj-1",
          goalId: "goal-1",
          status: "todo",
        },
      },
    ]);
    expect(issueService.comments).toEqual([
      {
        issueId: "issue-1",
        body: "Recommended split into NEW-1: Refactor the auth flow into a clean module",
        agentId: "psych-1",
        userId: undefined,
        runId: null,
      },
    ]);
  });

  it("truncates a long reason to 120 chars in the title", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
    });
    const longReason = "x".repeat(500);
    await actions.splitIssue("agent-1", longReason);
    const created = issueService.created[0].data;
    expect(created.title.length).toBe(120);
    expect(created.description).toBe(longReason);
  });

  it("respects an injected splitAuditMessageTemplate", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    const agentInstructions = new FakeAgentInstructions();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      splitAuditMessageTemplate: (childIdentifier, reason) =>
        `child=${childIdentifier} reason=${reason}`,
    });
    await actions.splitIssue("agent-1", "shrink scope");
    expect(issueService.comments[0].body).toBe("child=NEW-1 reason=shrink scope");
  });

  it("warns and no-ops when there is no active issue", async () => {
    const issueService = new FakeIssueService([]);
    const agentInstructions = new FakeAgentInstructions();
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await expect(actions.splitIssue("agent-1", "no parent")).resolves.toBeUndefined();
    expect(issueService.created).toEqual([]);
    expect(warnings.length).toBe(1);
  });

  it("never throws when issueService.create rejects", async () => {
    const issueService = new FakeIssueService([makeIssue()]);
    issueService.create = async () => {
      throw new Error("validation");
    };
    const agentInstructions = new FakeAgentInstructions();
    const { logger, warnings } = makeWarnLogger();
    const actions = new ServicePsychologistActions({
      db: makeFakeDb({ agents: [makeAgent()], issues: [makeIssue()] }),
      issueService: issueService as unknown as never,
      agentInstructions: agentInstructions as unknown as never,
      logger,
    });
    await expect(actions.splitIssue("agent-1", "x")).resolves.toBeUndefined();
    expect(warnings.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run server/src/__tests__/service-psychologist-actions.test.ts`

Expected: FAIL — `splitIssue` throws "not yet implemented".

- [ ] **Step 3: Replace the placeholder with the real implementation**

In `server/src/psychologist/service_psychologist_actions.ts`, replace:

```ts
  async splitIssue(_agentId: string, _reason: string): Promise<void> {
    // implemented in Task 6
    throw new Error("not yet implemented");
  }
```

with:

```ts
  async splitIssue(agentId: string, reason: string): Promise<void> {
    try {
      const parent = await this.findActiveIssue(agentId);
      if (!parent) {
        this.logger.warn("psychologist.splitIssue: no active issue", { agentId });
        return;
      }
      const title = reason.length > 120 ? reason.slice(0, 120) : reason;
      const child = await this.issueService.create(parent.companyId, {
        title,
        description: reason,
        parentId: parent.id,
        projectId: parent.projectId,
        goalId: parent.goalId,
        status: "todo",
      });
      const childIdentifier = child.identifier ?? child.id;
      try {
        await this.issueService.addComment(
          parent.id,
          this.splitAuditMessageTemplate(childIdentifier, reason),
          this.actorForComment(),
        );
      } catch (err) {
        this.logger.warn("psychologist.splitIssue: audit comment failed", {
          agentId,
          parentIssueId: parent.id,
          childIssueId: child.id,
          err: String(err),
        });
      }
    } catch (err) {
      this.logger.warn("psychologist.splitIssue failed", { agentId, err: String(err) });
    }
  }
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run server/src/__tests__/service-psychologist-actions.test.ts`

Expected: PASS — 17 tests pass total (4 + 4 + 4 + 5).

- [ ] **Step 5: Commit**

```bash
git add server/src/psychologist/service_psychologist_actions.ts \
        server/src/__tests__/service-psychologist-actions.test.ts
git commit -m "$(cat <<'EOF'
feat(m1+,server): wiring #1d — ServicePsychologistActions.splitIssue

Creates a single todo child issue (parentId / projectId / goalId
inherited from the active issue, no assignee — board/manager picks)
through issueService.create, then adds an audit comment to the parent
referencing the child identifier. Long reasons are truncated to 120
chars in the title; description preserves the full reason.

The audit-message template and the parent issue stay overrideable /
unchanged. Errors are caught and logged; the action never throws.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 7: Add `psychologistActorAgentId` config field

**Files:**
- Modify: `server/src/config.ts`

- [ ] **Step 1: Read the current config shape**

Open `server/src/config.ts` and confirm lines 85–90 contain the existing `Config` fields (`heartbeatSchedulerEnabled`, `transparencyGamma`, etc.) and lines 325–336 contain the corresponding `return { ... }` block.

- [ ] **Step 2: Add the new field to the `Config` interface**

In `server/src/config.ts`, after the line:

```ts
  transparencyGamma: import("@petagent/shared").TransparencyGamma;
```

add:

```ts
  psychologistActorAgentId: string | null;
```

- [ ] **Step 3: Populate the field in the `return { ... }` block**

In the same file, in the config-builder return block (the one that includes `transparencyGamma: resolveTransparencyGamma(...)`), add the line just below `transparencyGamma`:

```ts
    psychologistActorAgentId: resolvePsychologistActorAgentId(),
```

- [ ] **Step 4: Add the resolver helper**

After the existing `resolveTransparencyGamma` helper (around line 339), add:

```ts
function resolvePsychologistActorAgentId(): string | null {
  const raw = process.env.PETAGENT_PSYCHOLOGIST_ACTOR_AGENT_ID?.trim();
  return raw && raw.length > 0 ? raw : null;
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @petagent/server typecheck`

Expected: clean — `tsc --noEmit` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts
git commit -m "$(cat <<'EOF'
feat(m1+,server): wiring #1d — config psychologistActorAgentId

Adds optional `psychologistActorAgentId` to the resolved Config (env
PETAGENT_PSYCHOLOGIST_ACTOR_AGENT_ID). Default null. ServicePsychologistActions
takes this as deps.systemActorAgentId so board comments are attributed
to a configured psychologist agent when one exists, and stay system
(null author) otherwise.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 8: Server-stack composition test

**Files:**
- Create: `server/src/__tests__/psychologist-server-stack.test.ts`

This task adds **one composition case** that wires the three new server-side concretes (`ServicePsychologistActions`, registry constants) plus the package-level `InterventionDispatcher` against in-memory fakes for `issueService` / `agentInstructionsService` / `db`. The case proves the action layer composes correctly with the dispatcher and the capability registry.

The case lives **server-side**, not in `@petagent/psychologist`'s test tree, because the server-side concretes intentionally do not flow back into the psychologist package (zero-DB invariant from Group 7). Real-postgres E2E is left as a follow-up.

- [ ] **Step 1: Write the composition case**

Create `server/src/__tests__/psychologist-server-stack.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { InterventionDispatcher } from "@petagent/psychologist";
import {
  PSYCH_CAPABILITY_DEFAULTS,
  PSYCH_CAPABILITY_FALLBACK,
} from "../psychologist/psych_capability_registry.js";
import { ServicePsychologistActions } from "../psychologist/service_psychologist_actions.js";

describe("server-stack PsychologistActions composition", () => {
  it("routes a moderate intervention through dispatcher → inject + board comment via the service layer", async () => {
    interface IssueRow {
      id: string;
      companyId: string;
      status: string;
      assigneeAgentId: string | null;
      projectId: string | null;
      goalId: string | null;
      updatedAt: Date;
    }
    const agent = {
      id: "agent-1",
      companyId: "co-1",
      name: "Sigmund",
      adapterConfig: {},
      adapterType: "petagent",
    };
    const issueRow: IssueRow = {
      id: "issue-1",
      companyId: "co-1",
      status: "in_progress",
      assigneeAgentId: "agent-1",
      projectId: "proj-1",
      goalId: "goal-1",
      updatedAt: new Date(),
    };

    const writes: Array<{ relativePath: string; content: string }> = [];
    const comments: Array<{ issueId: string; body: string; agentId?: string }> = [];

    const fakeDb = {
      select: (cols?: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            limit: async () => (cols && "adapterConfig" in cols ? [agent] : [issueRow]),
            orderBy: () => ({ limit: async () => [issueRow] }),
          }),
        }),
      }),
    } as unknown as never;

    const fakeIssueService = {
      addComment: async (issueId: string, body: string, actor: { agentId?: string }) => {
        comments.push({ issueId, body, agentId: actor.agentId });
        return { id: "c-1", body };
      },
      update: async () => issueRow,
      create: async () => ({ id: "new-1", identifier: "NEW-1" }),
    };

    const fakeAgentInstructions = {
      writeFile: async (
        _agent: typeof agent,
        relativePath: string,
        content: string,
      ) => {
        writes.push({ relativePath, content });
        return {} as unknown;
      },
    };

    const actions = new ServicePsychologistActions({
      db: fakeDb,
      issueService: fakeIssueService,
      agentInstructions: fakeAgentInstructions,
      systemActorAgentId: "psych-1",
    });
    const dispatcher = new InterventionDispatcher(actions);

    // Capability check: petagent native gets the full set
    expect(PSYCH_CAPABILITY_DEFAULTS.petagent.supportsInstructionsBundle).toBe(true);
    expect(PSYCH_CAPABILITY_DEFAULTS.petagent.supportsBoardComment).toBe(true);
    expect(PSYCH_CAPABILITY_FALLBACK.supportsBoardComment).toBe(true);

    const result = await dispatcher.dispatch({
      targetAgentId: "agent-1",
      severity: "moderate",
      content: "metacognitive prompt",
      capabilities: PSYCH_CAPABILITY_DEFAULTS.petagent,
    });

    expect(result).toEqual({ kind: "instructions_inject_with_comment", succeeded: true });
    expect(writes).toEqual([
      { relativePath: "psychologist-injection.md", content: "metacognitive prompt" },
    ]);
    expect(comments).toEqual([
      { issueId: "issue-1", body: "metacognitive prompt", agentId: "psych-1" },
    ]);
  });

  it("routes severe intervention through pause when capability is granted", async () => {
    const issueRow = {
      id: "issue-2",
      companyId: "co-1",
      status: "in_progress",
      assigneeAgentId: "agent-2",
      projectId: null,
      goalId: null,
      updatedAt: new Date(),
    };
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const comments: Array<{ issueId: string; body: string }> = [];

    const fakeDb = {
      select: (cols?: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              cols && "adapterConfig" in cols
                ? [{ id: "agent-2", companyId: "co-1", name: "Anna", adapterConfig: {} }]
                : [issueRow],
            orderBy: () => ({ limit: async () => [issueRow] }),
          }),
        }),
      }),
    } as unknown as never;

    const fakeIssueService = {
      addComment: async (issueId: string, body: string) => {
        comments.push({ issueId, body });
        return { id: "c-1", body };
      },
      update: async (id: string, data: Record<string, unknown>) => {
        updates.push({ id, data });
        return issueRow;
      },
      create: async () => ({ id: "x", identifier: "X-1" }),
    };

    const fakeAgentInstructions = {
      writeFile: async () => ({}) as unknown,
    };

    const actions = new ServicePsychologistActions({
      db: fakeDb,
      issueService: fakeIssueService,
      agentInstructions: fakeAgentInstructions,
    });
    const dispatcher = new InterventionDispatcher(actions);

    const result = await dispatcher.dispatch({
      targetAgentId: "agent-2",
      severity: "severe",
      content: "stop and breathe",
      capabilities: PSYCH_CAPABILITY_DEFAULTS.petagent,
    });

    expect(result.kind).toBe("pause_therapy");
    expect(updates).toEqual([
      { id: "issue-2", data: { status: "blocked", actorAgentId: null } },
    ]);
    expect(comments[0].body).toBe("Paused for therapy session.");
  });
});
```

- [ ] **Step 2: Run the composition test**

Run: `pnpm exec vitest run server/src/__tests__/psychologist-server-stack.test.ts`

Expected: PASS — both composition cases pass.

- [ ] **Step 3: Run the full new-test set to confirm nothing regressed**

Run: `pnpm exec vitest run server/src/__tests__/psych-capability-registry.test.ts server/src/__tests__/drizzle-capabilities-provider.test.ts server/src/__tests__/service-psychologist-actions.test.ts server/src/__tests__/psychologist-server-stack.test.ts`

Expected: PASS — 28 tests total (4 registry + 5 provider + 17 actions + 2 composition).

- [ ] **Step 4: Commit**

```bash
git add server/src/__tests__/psychologist-server-stack.test.ts
git commit -m "$(cat <<'EOF'
test(m1+,server): wiring #1d — psychologist server-stack composition

Composes the new ServicePsychologistActions + psych capability registry
against the package-level InterventionDispatcher with in-memory fakes
for issueService / agentInstructionsService. Confirms moderate
intervention routes through inject + board comment, and severe routes
through pause + audit comment, end-to-end via the real dispatcher.

Real-postgres E2E (Group 9 Task 50 upgrade) is tracked as a follow-up.

Co-Authored-By: PetAgent <noreply@petagent.ing>
EOF
)"
```

---

## Task 9: Final cross-suite check

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`

Expected: clean.

- [ ] **Step 2: Run the whole vitest suite**

Run: `pnpm exec vitest run`

Expected: all green except the four pre-existing M0 environmental flakes documented in memory (embedded postgres concurrency + worktree fs 5s timeout). Total should be `1951 + 26 = 1977` passing or close to that depending on whether the server-stack composition case is double-counted.

If anything else fails, treat it as a regression and stop. Investigate, do not paper over.

- [ ] **Step 3: Update memory** (manual, no commit)

Edit `~/.claude/projects/-Volumes-t7-OpenSourceProject-PetAgent/memory/project_petagent.md`:

- Move `#1` from "🟡" / "(3/4 子项完成)" to "✅" with sub-items 1d marked done.
- Update the "下一步选择" section to drop `#1d` and promote `#2 MCP/SessionHook runtime glue` and the Group 9 Task 50 E2E upgrade to the front of the queue.
- Bump test count from `1951/2071` to the new total.

(No git commit needed — memory file lives outside the repo.)

---

## Notes

- **No `index.ts` barrel.** Following `#1a`/`#1b`/`#1c`, consumers import the concrete files directly.
- **No auto-start.** The Psychologist instance itself is not wired into `createApp` by this plan. Wiring + the deployment decision (start at boot vs. opt-in) is a separate follow-up tracked in memory under "下一步选择".
- **No new env in `.env.example`.** `PETAGENT_PSYCHOLOGIST_ACTOR_AGENT_ID` is optional; documented in the config helper. If `.env.example` is added later, mention it then.
- **DRY guidance.** The cross-package import in Task 8 is intentional and isolated to one test case. Do not refactor `@petagent/psychologist` to depend on `@petagent/server` — that would invert the layering and break the Group 7 zero-DB invariant.
