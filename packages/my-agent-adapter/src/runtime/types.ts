import type { PluginContext } from "../plugin.js";
import type { SessionHookSpec } from "@petagent/role-template";

export type Isolation = "none" | "worktree" | "remote";

export interface RuntimeInvocation {
  prompt: string;
  tools?: string[];
  maxTurns?: number;
  model?: string;
  effort?: "low" | "medium" | "high" | number;
  background?: boolean;
  /** Per-role MCP server subset (spec §3.8). Shortnames to intersect against the host registry. */
  mcpServers?: string[];
  /** Per-role session-lifecycle hooks (spec §3.9). Register at start, clean on stop. */
  hooks?: SessionHookSpec[];
}

export interface RuntimeResult {
  output: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costCents?: number;
  };
  artifacts?: Array<{ name: string; content: string }>;
}

export interface AgentRuntime {
  readonly isolation: Isolation;
  invoke(input: RuntimeInvocation, ctx: PluginContext): Promise<RuntimeResult>;
  health?(): Promise<{ ok: boolean; details?: string }>;
}
