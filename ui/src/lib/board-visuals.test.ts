import { describe, it, expect } from "vitest";
import {
  toolUseEmoji,
  roleEmoji,
  agentStatusDisplay,
  consecutiveFailuresFlag,
  bucketIssuesByStatus,
  ROLE_TYPE_EMOJI,
} from "./board-visuals";

describe("toolUseEmoji", () => {
  it("maps common tool names case-insensitively", () => {
    expect(toolUseEmoji("Read")).toBe("📖");
    expect(toolUseEmoji("READ")).toBe("📖");
    expect(toolUseEmoji("FileWrite")).toBe("✍️");
    expect(toolUseEmoji("Bash")).toBe("🔧");
    expect(toolUseEmoji("Grep")).toBe("🔍");
    expect(toolUseEmoji("Glob")).toBe("📂");
    expect(toolUseEmoji("WebFetch")).toBe("🌐");
    expect(toolUseEmoji("Task")).toBe("🤝");
  });

  it("maps intervention-ish tools to their indicator", () => {
    expect(toolUseEmoji("InstructionsInject")).toBe("💡");
    expect(toolUseEmoji("IssuePause")).toBe("⏸️");
    expect(toolUseEmoji("IssueSplit")).toBe("✂️");
  });

  it("uses the thinking emoji when no tool name is present", () => {
    expect(toolUseEmoji(null)).toBe("💭");
    expect(toolUseEmoji(undefined)).toBe("💭");
    expect(toolUseEmoji("   ")).toBe("💭");
  });

  it("falls back to 🔧 for unknown tool names", () => {
    expect(toolUseEmoji("CustomPluginTool")).toBe("🔧");
    expect(toolUseEmoji("SomeVendorMcpCall")).toBe("🔧");
  });
});

describe("ROLE_TYPE_EMOJI + roleEmoji", () => {
  it("covers the six built-in role types", () => {
    expect(ROLE_TYPE_EMOJI.coordinator).toBeTruthy();
    expect(ROLE_TYPE_EMOJI["worker/explorer"]).toBeTruthy();
    expect(ROLE_TYPE_EMOJI["worker/planner"]).toBeTruthy();
    expect(ROLE_TYPE_EMOJI["worker/executor"]).toBeTruthy();
    expect(ROLE_TYPE_EMOJI["worker/reviewer"]).toBeTruthy();
    expect(ROLE_TYPE_EMOJI.psychologist).toBeTruthy();
  });

  it("roleEmoji falls back to 🤖 for unknown / null role types", () => {
    expect(roleEmoji(null)).toBe("🤖");
    expect(roleEmoji("vendor/custom")).toBe("🤖");
  });
});

describe("agentStatusDisplay", () => {
  it("flags running agents with 'running' tone", () => {
    expect(agentStatusDisplay("running").tone).toBe("running");
  });

  it("flags idle and active as 'ok'", () => {
    expect(agentStatusDisplay("idle").tone).toBe("ok");
    expect(agentStatusDisplay("active").tone).toBe("ok");
  });

  it("flags paused / pending_approval as paused tone", () => {
    expect(agentStatusDisplay("paused").tone).toBe("paused");
    expect(agentStatusDisplay("pending_approval").tone).toBe("paused");
  });

  it("flags error / terminated as error tone", () => {
    expect(agentStatusDisplay("error").tone).toBe("error");
    expect(agentStatusDisplay("terminated").tone).toBe("error");
  });

  it("falls back to 'unknown' for anything else", () => {
    expect(agentStatusDisplay("mystery").tone).toBe("unknown");
    expect(agentStatusDisplay(null).tone).toBe("unknown");
  });
});

describe("consecutiveFailuresFlag", () => {
  it("counts consecutive failed statuses at the head", () => {
    expect(
      consecutiveFailuresFlag(["failed", "failed", "failed", "succeeded"])
        .consecutiveFailures,
    ).toBe(3);
  });

  it("stops at the first non-failure", () => {
    expect(
      consecutiveFailuresFlag(["failed", "succeeded", "failed", "failed", "failed"])
        .consecutiveFailures,
    ).toBe(1);
  });

  it("treats timed_out as a failure", () => {
    expect(
      consecutiveFailuresFlag(["timed_out", "failed", "timed_out", "queued"])
        .consecutiveFailures,
    ).toBe(3);
  });

  it("flags at the 3+ threshold (default)", () => {
    expect(consecutiveFailuresFlag(["failed", "failed"]).shouldFlag).toBe(false);
    const three = consecutiveFailuresFlag(["failed", "failed", "failed"]);
    expect(three.shouldFlag).toBe(true);
    expect(three.label).toMatch(/3 failures/);
  });

  it("respects custom threshold", () => {
    expect(consecutiveFailuresFlag(["failed", "failed"], 2).shouldFlag).toBe(true);
  });
});

describe("bucketIssuesByStatus", () => {
  it("drops issues with status=cancelled", () => {
    const out = bucketIssuesByStatus([
      { status: "cancelled" },
      { status: "done" },
    ]);
    expect(out.queued).toEqual([]);
    expect(out.done).toHaveLength(1);
  });

  it("puts in_progress in its own bucket; everything else non-terminal goes to queued", () => {
    const out = bucketIssuesByStatus([
      { status: "open" },
      { status: "backlog" },
      { status: "in_progress" },
      { status: "blocked" },
      { status: "done" },
    ]);
    expect(out.queued.map((i) => i.status).sort()).toEqual(["backlog", "blocked", "open"]);
    expect(out.inProgress).toHaveLength(1);
    expect(out.done).toHaveLength(1);
  });
});
