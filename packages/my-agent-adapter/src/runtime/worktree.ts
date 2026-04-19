// isolation: "worktree" — executes the agent inside a dedicated git worktree
// so its filesystem writes cannot collide with other concurrent agents.
//
// M1 scope: interface + path resolution. Actual git worktree creation /
// teardown is delegated to the existing Paperclip worktree service; we
// wire it in via dependency injection so tests don't require a real git.

import type { AgentRuntime, RuntimeInvocation, RuntimeResult } from "./types.js";
import type { PluginContext } from "../plugin.js";
import type { LocalInvoker } from "./local_process.js";

export interface WorktreeManager {
  ensureWorktreeFor(params: {
    agentId: string;
    issueId?: string;
  }): Promise<{ path: string; branch: string }>;
}

export class WorktreeRuntime implements AgentRuntime {
  readonly isolation = "worktree" as const;

  constructor(
    private readonly manager: WorktreeManager,
    private readonly invoker: LocalInvoker,
  ) {}

  async invoke(input: RuntimeInvocation, ctx: PluginContext): Promise<RuntimeResult> {
    const wt = await this.manager.ensureWorktreeFor({
      agentId: ctx.agentId,
      issueId: ctx.issueId,
    });
    ctx.logger.info("worktree ready", { path: wt.path, branch: wt.branch });
    const r = await this.invoker.invoke({
      agentId: ctx.agentId,
      prompt: input.prompt,
      tools: input.tools,
      cwd: wt.path,
    });
    return {
      output: r.output,
      usage: r.costCents !== undefined ? { costCents: r.costCents } : undefined,
    };
  }
}
