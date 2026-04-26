import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DragEvent } from "react";
import type { Agent, Issue } from "@petagent/shared";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { roleTemplatesApi, type RoleTemplateDescriptor } from "../api/role-templates";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import {
  bucketIssuesByStatus,
  consecutiveFailuresFlag,
  roleEmoji,
} from "../lib/board-visuals";
import {
  DRAG_TYPE_ROLE,
  decodeDragRoleType,
  encodeDragRoleType,
} from "../lib/hire-form";
import { ChatBar } from "../components/ChatBar";
import { EmployeeCard } from "../components/EmployeeCard";
import { HireDialog } from "../components/HireDialog";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export function Board() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [pendingHire, setPendingHire] = useState<RoleTemplateDescriptor | null>(null);
  const [isDraggingOver, setDraggingOver] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Board" }]);
  }, [setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(selectedCompanyId ?? ""),
    enabled: Boolean(selectedCompanyId),
  });

  const issuesQuery = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId ?? "__none__"),
    queryFn: () => issuesApi.list(selectedCompanyId ?? ""),
    enabled: Boolean(selectedCompanyId),
  });

  const rolesQuery = useQuery({
    queryKey: ["role-templates"],
    queryFn: () => roleTemplatesApi.list(),
    staleTime: 60_000,
  });

  const issues = issuesQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const roles = rolesQuery.data ?? [];

  const buckets = useMemo(() => bucketIssuesByStatus(issues), [issues]);
  const agentsByRole = useMemo(() => groupAgentsByRole(agents), [agents]);

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={Users}
        message="Select a company from the switcher to see its board."
      />
    );
  }
  if (agentsQuery.isLoading || issuesQuery.isLoading) return <PageSkeleton />;

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (Array.from(e.dataTransfer.types).includes(DRAG_TYPE_ROLE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDraggingOver(true);
    }
  };

  const onDragLeave = () => setDraggingOver(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingOver(false);
    const raw = e.dataTransfer.getData(DRAG_TYPE_ROLE);
    const roleType = decodeDragRoleType(raw);
    if (!roleType) return;
    const template = roles.find((r) => r.roleType === roleType);
    if (!template) return;
    setPendingHire(template);
  };

  return (
    <div
      className={`flex flex-col gap-4 ${isDraggingOver ? "outline outline-2 outline-sky-400/60" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ChatBar companyId={selectedCompanyId} />
      <EmployeeBar agentsByRole={agentsByRole} />
      <div className="flex gap-4">
        <RolePalette roles={roles} onPickRole={setPendingHire} />
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
          <KanbanColumn title="Queued" issues={buckets.queued} agents={agents} />
          <KanbanColumn title="In progress" issues={buckets.inProgress} agents={agents} />
          <KanbanColumn title="Done" issues={buckets.done} agents={agents} />
        </div>
      </div>
      {pendingHire && (
        <HireDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setPendingHire(null);
          }}
          companyId={selectedCompanyId}
          template={pendingHire}
        />
      )}
    </div>
  );
}

function groupAgentsByRole(
  agents: ReadonlyArray<Agent>,
): Array<{ roleType: string; agents: Agent[] }> {
  const bucket = new Map<string, Agent[]>();
  for (const agent of agents) {
    const cfg = (agent as Agent & { adapterConfig?: Record<string, unknown> | null })
      .adapterConfig;
    const roleType =
      (cfg && typeof cfg === "object" && typeof cfg.roleType === "string"
        ? cfg.roleType
        : null) ?? agent.role ?? "unknown";
    const list = bucket.get(roleType) ?? [];
    list.push(agent);
    bucket.set(roleType, list);
  }
  const out: Array<{ roleType: string; agents: Agent[] }> = [];
  for (const [roleType, list] of bucket.entries()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    out.push({ roleType, agents: list });
  }
  out.sort((a, b) => a.roleType.localeCompare(b.roleType));
  return out;
}

function EmployeeBar({
  agentsByRole,
}: {
  agentsByRole: Array<{ roleType: string; agents: Agent[] }>;
}) {
  if (agentsByRole.length === 0) {
    return (
      <Card>
        <CardContent className="p-3 text-sm text-muted-foreground">
          No agents yet — drag a role card from the palette to hire the first
          member.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-4 p-3">
        {agentsByRole.map((group) => (
          <div key={group.roleType} className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              <span className="mr-1" aria-hidden>
                {roleEmoji(group.roleType)}
              </span>
              {group.roleType}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.agents.map((agent) => (
                <EmployeeCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RolePalette({
  roles,
  onPickRole,
}: {
  roles: ReadonlyArray<RoleTemplateDescriptor>;
  onPickRole: (t: RoleTemplateDescriptor) => void;
}) {
  return (
    <Card className="min-w-[12rem] max-w-[14rem] self-start">
      <CardHeader>
        <CardTitle className="text-sm">Role palette</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-[10px] text-muted-foreground">
          Drag onto the board to hire, or click to open the HireDialog.
        </p>
        {roles.map((role) => (
          <button
            key={`${role.source}:${role.roleType}`}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                DRAG_TYPE_ROLE,
                encodeDragRoleType(role.roleType),
              );
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onPickRole(role)}
            className="w-full cursor-grab rounded border border-border bg-background p-2 text-left text-xs hover:bg-muted active:cursor-grabbing"
          >
            <div className="flex items-center gap-1">
              <span aria-hidden>{roleEmoji(role.roleType)}</span>
              <span className="font-medium">{role.roleType}</span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
              {role.description}
            </p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function KanbanColumn({
  title,
  issues,
  agents,
}: {
  title: string;
  issues: ReadonlyArray<Issue>;
  agents: ReadonlyArray<Agent>;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
      </div>
      {issues.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          —
        </p>
      ) : (
        issues.map((issue) => <IssueCard key={issue.id} issue={issue} agents={agents} />)
      )}
    </div>
  );
}

function IssueCard({
  issue,
  agents,
}: {
  issue: Issue;
  agents: ReadonlyArray<Agent>;
}) {
  const assignee = issue.assigneeAgentId
    ? agents.find((a) => a.id === issue.assigneeAgentId)
    : null;
  const failures = consecutiveFailuresFlag(
    Array.isArray((issue as { recentRunStatuses?: string[] }).recentRunStatuses)
      ? ((issue as { recentRunStatuses?: string[] }).recentRunStatuses ?? [])
      : [],
  );
  return (
    <div
      className={`space-y-1 rounded border bg-background p-2 text-xs ${failures.shouldFlag ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950" : "border-border"}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          {issue.identifier ?? issue.id.slice(0, 8)}
        </span>
        {assignee && (
          <span
            className="rounded bg-muted px-1 py-0.5 text-[10px]"
            title={assignee.name}
          >
            {assignee.name}
          </span>
        )}
      </div>
      <div className="font-medium">{issue.title}</div>
      {failures.shouldFlag && (
        <p className="text-[10px] font-medium text-yellow-900 dark:text-yellow-200">
          {failures.label}
        </p>
      )}
    </div>
  );
}
