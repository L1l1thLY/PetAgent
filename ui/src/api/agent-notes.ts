import { api } from "./client";

export type NoteScope = "user" | "project" | "local";

export interface AgentNote {
  id: string;
  companyId: string;
  agentId: string;
  scope: NoteScope;
  noteType: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  gitCommitSha?: string | null;
  sourceIssueId?: string | null;
  sessionId?: string | null;
  createdAt?: string;
}

export interface ListNotesArgs {
  companyId: string;
  agentId: string;
  limit?: number;
  scope?: NoteScope;
}

export interface SearchNotesArgs {
  companyId: string;
  agentId: string;
  query: string;
  topK?: number;
  scope?: NoteScope;
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export const agentNotesApi = {
  list: (args: ListNotesArgs) =>
    api.get<AgentNote[]>(
      `/companies/${args.companyId}/agents/${args.agentId}/notes${buildQueryString({
        limit: args.limit,
        scope: args.scope,
      })}`,
    ),
  search: (args: SearchNotesArgs) =>
    api.get<AgentNote[]>(
      `/companies/${args.companyId}/agents/${args.agentId}/notes/search${buildQueryString({
        q: args.query,
        topK: args.topK,
        scope: args.scope,
      })}`,
    ),
  view: (noteId: string) => api.get<AgentNote>(`/notes/${noteId}`),
};
