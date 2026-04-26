import { EventEmitter } from "node:events";
import type { LiveEvent, LiveEventType } from "@petagent/shared";
import { globalHookBus, type HookEventType } from "@petagent/hooks";

type LiveEventPayload = Record<string, unknown>;
type LiveEventListener = (event: LiveEvent) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let nextEventId = 0;

function toLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}): LiveEvent {
  nextEventId += 1;
  return {
    id: nextEventId,
    companyId: input.companyId,
    type: input.type,
    createdAt: new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

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

function forwardToHookBus(event: LiveEvent) {
  if (event.companyId === "*") return;
  const hookType = normalizeEventType(event.type, event.payload);
  if (!hookType) return;
  const payload = event.payload ?? {};
  const agentId = typeof payload.agentId === "string" ? payload.agentId : undefined;
  const issueId = typeof payload.issueId === "string" ? payload.issueId : undefined;
  void globalHookBus
    .publish({
      type: hookType,
      companyId: event.companyId,
      agentId,
      issueId,
      payload,
      timestamp: event.createdAt,
    })
    .catch((err) => {
      console.error("[hooks] publish failed", err);
    });
}

export function publishLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  const event = toLiveEvent(input);
  emitter.emit(input.companyId, event);
  forwardToHookBus(event);
  return event;
}

export function publishGlobalLiveEvent(input: {
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  const event = toLiveEvent({ companyId: "*", type: input.type, payload: input.payload });
  emitter.emit("*", event);
  return event;
}

export function subscribeCompanyLiveEvents(companyId: string, listener: LiveEventListener) {
  emitter.on(companyId, listener);
  return () => emitter.off(companyId, listener);
}

export function subscribeGlobalLiveEvents(listener: LiveEventListener) {
  emitter.on("*", listener);
  return () => emitter.off("*", listener);
}
