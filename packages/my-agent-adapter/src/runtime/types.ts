import type { PluginContext } from "../plugin.js";

export type Isolation = "none" | "worktree" | "remote";

export interface RuntimeInvocation {
  prompt: string;
  tools?: string[];
  maxTurns?: number;
  model?: string;
  effort?: "low" | "medium" | "high" | number;
  background?: boolean;
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
