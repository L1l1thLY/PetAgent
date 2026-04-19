import type { RoleTemplate, StructuredOutputProtocol } from "@petagent/role-template";
import type { HookEvent } from "@petagent/hooks";

export type PluginRole =
  | "coordinator"
  | "worker/explorer"
  | "worker/planner"
  | "worker/executor"
  | "worker/reviewer"
  | "psychologist";

export interface MemoryAPI {
  write(noteType: string, body: string, tags?: string[]): Promise<void>;
  search(query: { intent: string; maxResults?: number }): Promise<Array<{ body: string; tags: string[] }>>;
}

export interface HookPublisher {
  publish(event: Omit<HookEvent, "timestamp"> & { timestamp?: string }): Promise<void>;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface PluginContext {
  agentId: string;
  companyId: string;
  issueId?: string;
  heartbeatRunId?: string;
  memory: MemoryAPI;
  hooks: HookPublisher;
  logger: Logger;
  roleTemplate: RoleTemplate;
}

export interface PluginHealth {
  ok: boolean;
  details?: string;
}

export interface PetAgentPlugin<Input = unknown, Output = unknown> {
  readonly role: PluginRole;
  readonly module: string;
  readonly version: number;
  readonly metadata: { description: string; author: string; gitCommitSha?: string };
  execute(input: Input, ctx: PluginContext): Promise<Output>;
  shadow_execute?(input: Input, ctx: PluginContext): Promise<Output>;
  health?(): Promise<PluginHealth>;
  readonly structured_output_protocol?: StructuredOutputProtocol;
}
