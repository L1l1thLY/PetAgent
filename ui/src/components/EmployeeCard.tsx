import type { Agent } from "@petagent/shared";
import {
  agentStatusDisplay,
  roleEmoji,
  type AgentStatusTone,
} from "../lib/board-visuals";

const TONE_RING: Record<AgentStatusTone, string> = {
  ok: "ring-emerald-400/40",
  running: "ring-sky-400/60",
  paused: "ring-amber-400/60",
  error: "ring-red-500/60",
  unknown: "ring-muted",
};

export interface EmployeeCardProps {
  agent: Pick<
    Agent,
    | "id"
    | "name"
    | "status"
    | "role"
    | "adapterType"
    | "spentMonthlyCents"
    | "budgetMonthlyCents"
  > & {
    adapterConfig?: Record<string, unknown> | null;
  };
  onClick?: (agentId: string) => void;
}

/**
 * Compact employee chip rendered in the Board's EmployeeBar.
 * Shows:
 *   - status-toned ring + status emoji
 *   - role emoji
 *   - name
 *   - month spend / budget
 */
export function EmployeeCard({ agent, onClick }: EmployeeCardProps) {
  const statusDisplay = agentStatusDisplay(agent.status);
  const roleType = extractRoleType(agent);
  const spentDollars = Math.round((agent.spentMonthlyCents ?? 0) / 100);
  const budgetDollars = Math.round((agent.budgetMonthlyCents ?? 0) / 100);
  const pct =
    budgetDollars > 0
      ? Math.min(999, Math.round((spentDollars / budgetDollars) * 100))
      : null;

  return (
    <button
      type="button"
      onClick={() => onClick?.(agent.id)}
      className={`flex min-w-[9rem] items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left ring-2 ring-inset ${TONE_RING[statusDisplay.tone]} hover:bg-muted`}
      title={`${agent.name} — ${statusDisplay.label}`}
    >
      <span className="text-xl" aria-hidden>
        {roleEmoji(roleType)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-medium">{agent.name}</span>
          <span className="text-xs" aria-hidden>
            {statusDisplay.emoji}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {roleType ?? agent.role ?? "unknown"}
          {pct !== null && (
            <>
              {" · "}${spentDollars}/${budgetDollars}{" "}
              <span
                className={
                  pct >= 100
                    ? "text-red-600"
                    : pct >= 90
                      ? "text-orange-600"
                      : pct >= 70
                        ? "text-amber-600"
                        : ""
                }
              >
                ({pct}%)
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function extractRoleType(agent: {
  adapterConfig?: Record<string, unknown> | null;
}): string | null {
  const cfg = agent.adapterConfig;
  if (cfg && typeof cfg === "object" && typeof cfg.roleType === "string") {
    return cfg.roleType;
  }
  return null;
}
