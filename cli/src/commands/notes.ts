import type { Command } from "commander";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

export interface NoteSummary {
  id: string;
  scope: string;
  content: string;
  noteType?: string;
  tags?: string[];
  createdAt: string;
  gitCommitSha?: string | null;
  sourceIssueId?: string | null;
}

interface ListPathInput {
  companyId: string;
  agentId: string;
  limit?: number;
  scope?: string;
}

export function buildNotesListPath(input: ListPathInput): string {
  const params = new URLSearchParams();
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.scope) params.set("scope", input.scope);
  const qs = params.toString();
  const base = `/api/companies/${input.companyId}/agents/${input.agentId}/notes`;
  return qs ? `${base}?${qs}` : base;
}

interface SearchPathInput {
  companyId: string;
  agentId: string;
  query: string;
  topK?: number;
  scope?: string;
}

export function buildNotesSearchPath(input: SearchPathInput): string {
  const params = new URLSearchParams();
  params.set("q", input.query);
  if (input.topK !== undefined) params.set("topK", String(input.topK));
  if (input.scope) params.set("scope", input.scope);
  return `/api/companies/${input.companyId}/agents/${input.agentId}/notes/search?${params.toString()}`;
}

interface ViewPathInput {
  noteId: string;
}

export function buildNoteViewPath(input: ViewPathInput): string {
  return `/api/notes/${input.noteId}`;
}

interface SummaryInput {
  id: string;
  scope: string;
  content: string;
  createdAt: Date | string;
}

export function formatNoteSummary(n: SummaryInput): string {
  const ts = (n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt)).toISOString();
  const head = n.content.replace(/\s+/g, " ").slice(0, 60);
  return `${n.id} [${n.scope}] ${ts} — ${head}`;
}

interface NotesListOptions extends BaseClientOptions {
  agent: string;
  limit?: number;
  scope?: string;
}

interface NotesSearchOptions extends BaseClientOptions {
  agent: string;
  query: string;
  topK?: number;
  scope?: string;
}

interface NotesViewOptions extends BaseClientOptions {
  noteId: string;
}

export function registerNotesCommand(program: Command): void {
  const notes = program
    .command("notes")
    .description("Inspect agent notes (read-only).");

  addCommonClientOptions(
    notes
      .command("list")
      .description("List recent notes for an agent")
      .requiredOption("--agent <agentId>", "Agent ID")
      .option("--limit <n>", "Max rows (default 50, max 200)", (v) => Number(v))
      .option("--scope <scope>", "Filter by scope (user|project|local)")
      .action(async (opts: NotesListOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const path = buildNotesListPath({
            companyId: ctx.companyId!,
            agentId: opts.agent,
            limit: opts.limit,
            scope: opts.scope,
          });
          const rows = (await ctx.api.get<NoteSummary[]>(path)) ?? [];
          if (ctx.json) {
            printOutput(rows, { json: true });
            return;
          }
          for (const row of rows) console.log(formatNoteSummary(row));
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: true },
  );

  addCommonClientOptions(
    notes
      .command("search")
      .description("Semantic search over an agent's notes")
      .requiredOption("--agent <agentId>", "Agent ID")
      .requiredOption("--query <text>", "Query text")
      .option("--top-k <n>", "Top K (default 10, max 50)", (v) => Number(v))
      .option("--scope <scope>", "Filter by scope (user|project|local)")
      .action(async (opts: NotesSearchOptions & { topK?: number }) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const path = buildNotesSearchPath({
            companyId: ctx.companyId!,
            agentId: opts.agent,
            query: opts.query,
            topK: opts.topK,
            scope: opts.scope,
          });
          const rows = (await ctx.api.get<NoteSummary[]>(path)) ?? [];
          if (ctx.json) {
            printOutput(rows, { json: true });
            return;
          }
          for (const row of rows) console.log(formatNoteSummary(row));
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: true },
  );

  addCommonClientOptions(
    notes
      .command("view")
      .description("View a single note by id")
      .requiredOption("--note-id <id>", "Note ID")
      .action(async (opts: NotesViewOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: false });
          const path = buildNoteViewPath({ noteId: opts.noteId });
          const note = await ctx.api.get<NoteSummary>(path);
          if (!note) {
            console.error("Note not found");
            process.exit(1);
          }
          if (ctx.json) {
            printOutput(note, { json: true });
            return;
          }
          console.log(formatNoteSummary(note));
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
