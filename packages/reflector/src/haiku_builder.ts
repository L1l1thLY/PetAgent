/**
 * LLM-backed ReflectionBuilder (M2 Group 2 Task 7).
 *
 * Calls Anthropic Messages with a small reflection prompt. Falls back
 * to a templated note when the transport throws or returns empty text
 * — Reflector itself already swallows builder errors, but the builder
 * still returns a structurally valid note so the persisted record
 * carries provenance.
 */

import type { HookEvent } from "@petagent/hooks";
import type { ReflectionBuilder, ReflectionContext } from "./types.js";
import { TemplatedReflectionBuilder } from "./templated_builder.js";

const SYSTEM_PROMPT = `You are an agent's reflective journal.
Given a single heartbeat run summary, write 1-3 sentences in first person
capturing what was attempted, what status the run ended in, and what to
remember next time. No bullet points, no preamble, no headers — just
the reflective sentences. Stay under 80 words.`;

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 256;

export interface ReflectionTransport {
  send(args: { system: string; userMessage: string; maxTokens: number; model: string }): Promise<string>;
}

export interface HaikuReflectionBuilderDeps {
  transport: ReflectionTransport;
  model?: string;
  maxTokens?: number;
}

export class HaikuReflectionBuilder implements ReflectionBuilder {
  private readonly transport: ReflectionTransport;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fallback = new TemplatedReflectionBuilder();

  constructor(deps: HaikuReflectionBuilderDeps) {
    this.transport = deps.transport;
    this.model = deps.model ?? DEFAULT_MODEL;
    this.maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async build(event: HookEvent, _context?: ReflectionContext): Promise<{ content: string; noteType: string }> {
    const userMessage = renderUserMessage(event);
    let llmText = "";
    try {
      llmText = (await this.transport.send({
        system: SYSTEM_PROMPT,
        userMessage,
        maxTokens: this.maxTokens,
        model: this.model,
      })).trim();
    } catch (err) {
      const templated = this.fallback.build(event);
      return {
        content: templated.content.replace(
          "Auto-templated reflection.",
          `Auto-templated reflection (LLM call failed: ${truncate(String(err), 80)}).`,
        ),
        noteType: templated.noteType,
      };
    }
    if (llmText.length === 0) {
      const templated = this.fallback.build(event);
      return {
        content: templated.content.replace(
          "Auto-templated reflection.",
          "Auto-templated reflection (LLM returned empty).",
        ),
        noteType: templated.noteType,
      };
    }
    return { content: llmText, noteType: "heartbeat_reflection" };
  }
}

function renderUserMessage(event: HookEvent): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const status = typeof payload.status === "string" ? payload.status : "unknown";
  const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : null;
  const lines = [
    `status: ${status}`,
    durationMs !== null ? `duration: ${durationMs}ms` : null,
    event.issueId ? `issue: ${event.issueId}` : null,
    event.agentId ? `agent: ${event.agentId}` : null,
  ].filter(Boolean) as string[];
  return `Heartbeat run summary:\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
