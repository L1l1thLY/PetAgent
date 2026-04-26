import type { HookEvent } from "@petagent/hooks";
import type { ReflectionBuilder, ReflectionContext } from "./types.js";

/**
 * No-LLM templated reflection — captures the bare facts of a heartbeat
 * run. M2 Group 2 will swap this for a Haiku-backed builder.
 */
export class TemplatedReflectionBuilder implements ReflectionBuilder {
  build(event: HookEvent, _context?: ReflectionContext): { content: string; noteType: string } {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status : "unknown";
    const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : null;
    const issueLine = event.issueId ? `\n- issue: ${event.issueId}` : "";
    const durationLine = durationMs !== null ? `\n- duration: ${durationMs}ms` : "";
    const content =
      `## Heartbeat reflection\n\n` +
      `- status: ${status}${durationLine}${issueLine}\n\n` +
      `Auto-templated reflection. M2 Group 2 will replace this with a Haiku-built note.`;
    return { content, noteType: "heartbeat_reflection" };
  }
}
