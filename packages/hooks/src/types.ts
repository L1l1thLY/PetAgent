export type HookEventType =
  | "agent.output"
  | "agent.status_change"
  | "issue.created"
  | "issue.updated"
  | "comment.posted"
  | "heartbeat.started"
  | "heartbeat.ended"
  | "memory.written"
  | "approval.requested"
  | "approval.resolved"
  | "company.created";

export interface HookEvent {
  type: HookEventType;
  companyId: string;
  agentId?: string;
  issueId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface HookSubscriber {
  name: string;
  filter?: (event: HookEvent) => boolean;
  handle(event: HookEvent): Promise<void> | void;
}
