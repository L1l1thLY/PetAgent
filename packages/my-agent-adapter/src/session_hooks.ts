/**
 * Per-Role session-lifecycle hooks (spec §3.9).
 *
 * A role template may declare `hooks: [{ event, command }]` entries
 * for four lifecycle events: on_start / after_tool_use /
 * before_stop / on_error. Hooks are registered when a session starts
 * and unregistered when it stops, so one agent's hooks never leak to
 * another.
 *
 * This module ships the SessionHookManager + a `HookCommandRunner` port
 * for how the command actually executes (shell, in-process callback,
 * or test fake). Concrete shell-execution wiring — with secrets
 * redaction, timeouts, and cwd handling appropriate to the server's
 * sandbox — is out of scope; lands with the live runtime integration.
 */

import { SESSION_HOOK_EVENTS, type SessionHookEvent, type SessionHookSpec } from "@petagent/role-template";

export interface HookRunContext {
  sessionId: string;
  agentId: string;
  role: string;
  event: SessionHookEvent;
  /** Optional event payload (e.g. the tool name for after_tool_use). */
  payload?: Record<string, unknown>;
}

export interface HookRunResult {
  succeeded: boolean;
  exitCode?: number;
  durationMs: number;
  error?: Error;
}

export interface HookCommandRunner {
  run(
    spec: SessionHookSpec,
    ctx: HookRunContext,
  ): Promise<HookRunResult>;
}

export interface SessionHookRegistration {
  readonly sessionId: string;
  readonly agentId: string;
  readonly role: string;
  readonly hooks: ReadonlyArray<SessionHookSpec>;
}

export interface HookInvocationRecord {
  spec: SessionHookSpec;
  ctx: HookRunContext;
  result: HookRunResult;
}

export interface SessionHookManagerOptions {
  /** Surface per-hook failures via console.warn. Default true. */
  logFailures?: boolean;
}

/**
 * Owns the per-session hook registry. Hook execution goes through the
 * injected HookCommandRunner. One hook crashing must not affect the
 * others in the same event — errors are isolated.
 */
export class SessionHookManager {
  private readonly registrations = new Map<string, SessionHookRegistration>();
  private readonly logFailures: boolean;

  constructor(
    private readonly runner: HookCommandRunner,
    opts: SessionHookManagerOptions = {},
  ) {
    this.logFailures = opts.logFailures ?? true;
  }

  /** Register a session's hooks. Idempotent: re-registering replaces the prior set. */
  register(input: {
    sessionId: string;
    agentId: string;
    role: string;
    hooks?: ReadonlyArray<SessionHookSpec>;
  }): void {
    if (input.sessionId.length === 0) {
      throw new Error("sessionId must be non-empty");
    }
    this.registrations.set(input.sessionId, {
      sessionId: input.sessionId,
      agentId: input.agentId,
      role: input.role,
      hooks: input.hooks ?? [],
    });
  }

  /** Unregister a session's hooks. No-op if the session was never registered. */
  unregister(sessionId: string): void {
    this.registrations.delete(sessionId);
  }

  getRegistration(sessionId: string): SessionHookRegistration | undefined {
    return this.registrations.get(sessionId);
  }

  listActive(): ReadonlyArray<SessionHookRegistration> {
    return Array.from(this.registrations.values());
  }

  /**
   * Fire every hook registered for the given (session, event), in declaration
   * order. Each hook runs through the injected HookCommandRunner; failures
   * are isolated and returned per-hook — one hook crashing does NOT skip
   * subsequent hooks for the same event.
   */
  async fire(
    sessionId: string,
    event: SessionHookEvent,
    payload?: Record<string, unknown>,
  ): Promise<HookInvocationRecord[]> {
    const registration = this.registrations.get(sessionId);
    if (!registration) return [];
    const matching = registration.hooks.filter((h) => h.event === event);
    const records: HookInvocationRecord[] = [];
    for (const spec of matching) {
      const ctx: HookRunContext = {
        sessionId,
        agentId: registration.agentId,
        role: registration.role,
        event,
        payload,
      };
      let result: HookRunResult;
      try {
        result = await this.runner.run(spec, ctx);
      } catch (err) {
        result = {
          succeeded: false,
          durationMs: 0,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
      if (!result.succeeded && this.logFailures) {
        console.warn(
          `[session-hook] ${event} command="${spec.command}" agent=${registration.agentId} failed:`,
          result.error?.message ?? `exit=${result.exitCode ?? "?"}`,
        );
      }
      records.push({ spec, ctx, result });
    }
    return records;
  }
}

/** Convenience predicate for runtime-invocation checks. */
export function isSessionHookEvent(value: string): value is SessionHookEvent {
  return (SESSION_HOOK_EVENTS as ReadonlyArray<string>).includes(value);
}

/**
 * Convenience runner that records every invocation without executing
 * anything. Useful for tests and for composing higher-level managers.
 */
export class RecordingHookRunner implements HookCommandRunner {
  readonly invocations: Array<{
    spec: SessionHookSpec;
    ctx: HookRunContext;
  }> = [];

  constructor(
    private readonly resultFor: (spec: SessionHookSpec, ctx: HookRunContext) => HookRunResult = () => ({
      succeeded: true,
      exitCode: 0,
      durationMs: 0,
    }),
  ) {}

  async run(spec: SessionHookSpec, ctx: HookRunContext): Promise<HookRunResult> {
    this.invocations.push({ spec, ctx });
    return this.resultFor(spec, ctx);
  }
}
