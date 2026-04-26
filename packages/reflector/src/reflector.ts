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
      const built = await this.builder.build(event);
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
