import { describe, it, expect } from "vitest";
import {
  buildNotesListPath,
  buildNotesSearchPath,
  buildNoteViewPath,
  formatNoteSummary,
} from "../commands/notes.js";

describe("notes CLI path builders", () => {
  it("buildNotesListPath honors limit + scope", () => {
    const p = buildNotesListPath({
      companyId: "co-1",
      agentId: "agent-1",
      limit: 25,
      scope: "project",
    });
    expect(p).toBe("/api/companies/co-1/agents/agent-1/notes?limit=25&scope=project");
  });

  it("buildNotesListPath omits optional params when absent", () => {
    const p = buildNotesListPath({ companyId: "co-1", agentId: "agent-1" });
    expect(p).toBe("/api/companies/co-1/agents/agent-1/notes");
  });

  it("buildNotesSearchPath encodes the query", () => {
    const p = buildNotesSearchPath({
      companyId: "co-1",
      agentId: "agent-1",
      query: "deploy & restart",
      topK: 5,
    });
    expect(p).toBe("/api/companies/co-1/agents/agent-1/notes/search?q=deploy+%26+restart&topK=5");
  });

  it("buildNoteViewPath returns the global notes endpoint", () => {
    const p = buildNoteViewPath({ noteId: "note-1" });
    expect(p).toBe("/api/notes/note-1");
  });

  it("formatNoteSummary renders id + scope + first 60 content chars", () => {
    const summary = formatNoteSummary({
      id: "note-1",
      scope: "project",
      content: "Deploy to vercel via CLI flag --token, do not use env VERCEL_TOKEN.",
      createdAt: "2026-04-25T10:00:00.000Z",
    });
    expect(summary).toContain("note-1");
    expect(summary).toContain("project");
    expect(summary).toContain("Deploy to vercel via CLI flag --token, do not use env V");
  });
});
