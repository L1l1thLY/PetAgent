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

export interface ReflectionBuilder {
  build(event: HookEvent): { content: string; noteType: string };
}
