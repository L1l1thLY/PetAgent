import { describe, it, expect } from "vitest";
import { TemplatedReflectionBuilder } from "../templated_builder.js";

describe("TemplatedReflectionBuilder", () => {
  const builder = new TemplatedReflectionBuilder();

  it("renders status from payload", () => {
    const out = builder.build({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "agent-1",
      issueId: "issue-1",
      payload: { status: "succeeded", durationMs: 1234 },
      timestamp: new Date().toISOString(),
    });
    expect(out.noteType).toBe("heartbeat_reflection");
    expect(out.content).toContain("status: succeeded");
    expect(out.content).toContain("duration: 1234ms");
    expect(out.content).toContain("issue: issue-1");
  });

  it("omits duration line when payload has no duration", () => {
    const out = builder.build({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "agent-1",
      payload: { status: "failed" },
      timestamp: new Date().toISOString(),
    });
    expect(out.content).toContain("status: failed");
    expect(out.content).not.toContain("duration:");
  });

  it("falls back to 'unknown' status when payload is empty", () => {
    const out = builder.build({
      type: "heartbeat.ended",
      companyId: "co-1",
      agentId: "agent-1",
      timestamp: new Date().toISOString(),
    });
    expect(out.content).toContain("status: unknown");
  });
});
