// isolation: "remote" — wraps Anthropic Managed Agents HTTP.
//
// M1 scope: interface + request shaping only. Concrete Anthropic SDK call is
// injected so tests can stub it; real integration lands in a follow-up PR
// that also tackles streaming + token accounting.

import type { AgentRuntime, RuntimeInvocation, RuntimeResult } from "./types.js";
import type { PluginContext } from "../plugin.js";

export interface ManagedAgentsClient {
  invoke(params: {
    prompt: string;
    tools?: string[];
    model?: string;
    maxTurns?: number;
    metadata?: Record<string, string>;
  }): Promise<{
    output: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  }>;
}

export class ManagedAgentsRuntime implements AgentRuntime {
  readonly isolation = "remote" as const;

  constructor(private readonly client: ManagedAgentsClient) {}

  async invoke(input: RuntimeInvocation, ctx: PluginContext): Promise<RuntimeResult> {
    const response = await this.client.invoke({
      prompt: input.prompt,
      tools: input.tools,
      model: input.model,
      maxTurns: input.maxTurns,
      metadata: {
        companyId: ctx.companyId,
        agentId: ctx.agentId,
        issueId: ctx.issueId ?? "",
        role: ctx.roleTemplate.roleType,
      },
    });
    return {
      output: response.output,
      usage: response.usage,
    };
  }
}
