// isolation: "none" — invokes a local claude_local / codex_local adapter
// already registered in Paperclip's adapter registry. This runtime is a
// thin wrapper: it hands the invocation off to whichever local adapter
// Paperclip configured for the agent.

import type { AgentRuntime, RuntimeInvocation, RuntimeResult } from "./types.js";
import type { PluginContext } from "../plugin.js";

export interface LocalInvoker {
  invoke(params: {
    agentId: string;
    prompt: string;
    tools?: string[];
    cwd?: string;
  }): Promise<{ output: string; costCents?: number }>;
}

export class LocalProcessRuntime implements AgentRuntime {
  readonly isolation = "none" as const;

  constructor(private readonly invoker: LocalInvoker) {}

  async invoke(input: RuntimeInvocation, ctx: PluginContext): Promise<RuntimeResult> {
    const r = await this.invoker.invoke({
      agentId: ctx.agentId,
      prompt: input.prompt,
      tools: input.tools,
    });
    return {
      output: r.output,
      usage: r.costCents !== undefined ? { costCents: r.costCents } : undefined,
    };
  }
}
