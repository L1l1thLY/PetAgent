import type { HookBus, HookEvent } from "@petagent/hooks";
import type { IncidentStore } from "./types.js";

const SUBSCRIBER_NAME = "psychologist:outcome";
const RECENT_PENDING_DEPTH = 5;

const RECOVER_STATUSES = new Set(["succeeded", "completed", "ok"]);
const ESCALATE_STATUSES = new Set(["failed", "errored", "error"]);

export interface OutcomeTrackerDeps {
  bus: HookBus;
  incidents: IncidentStore;
  recentPendingDepth?: number;
  subscriberName?: string;
}

export class OutcomeTracker {
  private readonly recentDepth: number;
  private readonly name: string;

  constructor(private readonly deps: OutcomeTrackerDeps) {
    this.recentDepth = deps.recentPendingDepth ?? RECENT_PENDING_DEPTH;
    this.name = deps.subscriberName ?? SUBSCRIBER_NAME;
  }

  async start(): Promise<void> {
    this.deps.bus.register({
      name: this.name,
      filter: (e) => e.type === "heartbeat.ended",
      handle: (e) => this.onEnded(e),
    });
  }

  async stop(): Promise<void> {
    this.deps.bus.unregister(this.name);
  }

  private async onEnded(event: HookEvent): Promise<void> {
    if (!event.agentId) return;
    const status = String(event.payload?.status ?? "");
    let outcome: "recovered" | "escalated" | null = null;
    if (RECOVER_STATUSES.has(status)) outcome = "recovered";
    else if (ESCALATE_STATUSES.has(status)) outcome = "escalated";
    if (outcome === null) return;

    try {
      const pending = await this.deps.incidents.recentForAgent(
        event.agentId,
        this.recentDepth,
      );
      if (pending.length === 0) return;
      const latest = pending.reduce((a, b) =>
        a.createdAt.getTime() >= b.createdAt.getTime() ? a : b,
      );
      await this.deps.incidents.updateOutcome(
        latest.id,
        outcome,
        `heartbeat.status=${status}`,
      );
    } catch (err) {
      console.error("[psychologist:outcome] update failed", err);
    }
  }
}
