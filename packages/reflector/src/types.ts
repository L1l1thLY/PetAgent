import type { HookEvent } from "@petagent/hooks";

export interface NotesSink {
  create(args: {
    agentId: string;
    companyId: string;
    content: string;
    scope: "user" | "project" | "local";
    sourceIssueId?: string;
    noteType: string;
  }): Promise<{ id: string }>;
}

export interface ReflectionContext {
  recentOutputs: string[];
  issueTitle?: string;
  issueDescription?: string;
}

export interface ReflectionContextSource {
  fetchContext(args: { agentId: string; issueId?: string }): Promise<ReflectionContext>;
}

export interface ReflectionBuilder {
  build(
    event: HookEvent,
    context?: ReflectionContext,
  ): { content: string; noteType: string } | Promise<{ content: string; noteType: string }>;
}
