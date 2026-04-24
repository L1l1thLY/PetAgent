/**
 * Pure helpers for the Board UI (spec §17.1):
 *   - tool_name → emoji mapping for the conversation flow
 *   - role → emoji mapping for the employee bar
 *   - agent status → display tone / label
 *   - consecutive-failures flag ("⚠️ N failures in a row")
 *
 * These are separated from the React components so the mappings can be
 * unit-tested without a DOM or render cycle.
 */

export function toolUseEmoji(toolName: string | null | undefined): string {
  const name = (toolName ?? "").trim();
  const lower = name.toLowerCase();
  if (!name) return "💭";
  if (lower === "read" || lower === "fileread") return "📖";
  if (lower === "write" || lower === "filewrite") return "✍️";
  if (lower === "edit" || lower === "fileedit" || lower === "multiedit") return "✏️";
  if (lower === "bash" || lower === "shell" || lower === "terminal") return "🔧";
  if (lower === "grep" || lower === "search") return "🔍";
  if (lower === "glob" || lower === "ls" || lower === "find") return "📂";
  if (lower === "webfetch" || lower === "websearch" || lower === "http") return "🌐";
  if (lower === "task" || lower === "agent" || lower.includes("delegate")) return "🤝";
  if (lower === "issuecreate" || lower === "issueassign") return "📝";
  if (lower === "issuecomment" || lower === "boardcomment") return "💬";
  if (lower === "notebookedit") return "📓";
  if (lower === "instructionsinject" || lower === "inject") return "💡";
  if (lower === "issuepause" || lower === "pause") return "⏸️";
  if (lower === "issuesplit" || lower === "split") return "✂️";
  return "🔧";
}

export const ROLE_TYPE_EMOJI: Record<string, string> = {
  coordinator: "🎯",
  "worker/explorer": "🔎",
  "worker/planner": "🗺️",
  "worker/executor": "⚙️",
  "worker/reviewer": "🧪",
  psychologist: "🧠",
};

export function roleEmoji(roleType: string | null | undefined): string {
  if (!roleType) return "🤖";
  return ROLE_TYPE_EMOJI[roleType] ?? "🤖";
}

export type AgentStatusTone = "ok" | "running" | "paused" | "error" | "unknown";

export interface AgentStatusDisplay {
  tone: AgentStatusTone;
  label: string;
  emoji: string;
}

/** Narrow an Agent.status string to a display tone + label + emoji. */
export function agentStatusDisplay(status: string | null | undefined): AgentStatusDisplay {
  switch (status) {
    case "idle":
      return { tone: "ok", label: "idle", emoji: "💤" };
    case "active":
      return { tone: "ok", label: "active", emoji: "🟢" };
    case "running":
      return { tone: "running", label: "running", emoji: "🏃" };
    case "paused":
      return { tone: "paused", label: "paused", emoji: "⏸️" };
    case "error":
      return { tone: "error", label: "error", emoji: "🚨" };
    case "pending_approval":
      return { tone: "paused", label: "pending approval", emoji: "⏳" };
    case "terminated":
      return { tone: "error", label: "terminated", emoji: "🪦" };
    default:
      return { tone: "unknown", label: status ?? "unknown", emoji: "❔" };
  }
}

export interface IssueFailureFlag {
  shouldFlag: boolean;
  consecutiveFailures: number;
  label?: string;
}

/**
 * Given a recent run status history for a single agent (newest first, like
 * the behavior-monitor store), return a flag indicating whether the Board
 * should highlight "⚠️ N failures in a row" on the issue card.
 *
 * Mirrors the Psychologist's behavior-monitor threshold (≥3 → moderate).
 */
export function consecutiveFailuresFlag(
  recentStatuses: ReadonlyArray<string>,
  threshold = 3,
): IssueFailureFlag {
  let count = 0;
  for (const status of recentStatuses) {
    if (status === "failed" || status === "timed_out") count += 1;
    else break;
  }
  const shouldFlag = count >= threshold;
  return {
    shouldFlag,
    consecutiveFailures: count,
    label: shouldFlag ? `⚠️ ${count} failures in a row` : undefined,
  };
}

export interface KanbanBuckets<T> {
  queued: T[];
  inProgress: T[];
  done: T[];
}

/**
 * Bucket issues by their status into the three Kanban columns. Cancelled
 * issues are intentionally omitted from the Board view (they have their
 * own surface in /issues/all).
 */
export function bucketIssuesByStatus<T extends { status: string }>(
  issues: ReadonlyArray<T>,
): KanbanBuckets<T> {
  const queued: T[] = [];
  const inProgress: T[] = [];
  const done: T[] = [];
  for (const issue of issues) {
    if (issue.status === "in_progress") inProgress.push(issue);
    else if (issue.status === "done") done.push(issue);
    else if (issue.status === "cancelled") continue;
    else queued.push(issue);
  }
  return { queued, inProgress, done };
}
