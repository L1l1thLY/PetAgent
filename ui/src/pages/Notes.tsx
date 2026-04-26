import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Notebook } from "lucide-react";
import { agentNotesApi, type AgentNote, type NoteScope } from "../api/agent-notes";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SCOPES: Array<{ value: NoteScope | ""; label: string }> = [
  { value: "", label: "all scopes" },
  { value: "user", label: "user" },
  { value: "project", label: "project" },
  { value: "local", label: "local" },
];

export function Notes() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [agentId, setAgentId] = useState<string>("");
  const [scope, setScope] = useState<NoteScope | "">("");
  const [pendingQuery, setPendingQuery] = useState<string>("");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Notes" }]);
  }, [setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(selectedCompanyId ?? ""),
    enabled: Boolean(selectedCompanyId),
  });
  const agents = agentsQuery.data ?? [];

  useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;
  const scopeArg = scope === "" ? undefined : scope;

  const listQuery = useQuery({
    queryKey: queryKeys.agentNotes.list(
      selectedCompanyId ?? "__none__",
      agentId,
      scope || undefined,
    ),
    queryFn: () =>
      agentNotesApi.list({
        companyId: selectedCompanyId ?? "",
        agentId,
        scope: scopeArg,
        limit: 50,
      }),
    enabled: Boolean(selectedCompanyId) && Boolean(agentId) && !isSearching,
  });

  const searchQuery = useQuery({
    queryKey: queryKeys.agentNotes.search(
      selectedCompanyId ?? "__none__",
      agentId,
      trimmedQuery,
      scope || undefined,
    ),
    queryFn: () =>
      agentNotesApi.search({
        companyId: selectedCompanyId ?? "",
        agentId,
        query: trimmedQuery,
        scope: scopeArg,
        topK: 20,
      }),
    enabled: Boolean(selectedCompanyId) && Boolean(agentId) && isSearching,
  });

  const activeQuery = isSearching ? searchQuery : listQuery;
  const rows: AgentNote[] = activeQuery.data ?? [];

  const submit = () => setQuery(pendingQuery);

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={Notebook}
        message="Select a company from the switcher to browse its agent notes."
      />
    );
  }

  if (activeQuery.isLoading && agents.length > 0) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Notebook className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Notes</CardTitle>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Recent notes left by agents in this company.
          </p>
          <div className="flex flex-wrap gap-2 pt-3">
            <select
              aria-label="Agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as NoteScope | "")}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Search notes…"
              value={pendingQuery}
              onChange={(e) => setPendingQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="h-9 min-w-[200px] flex-1 rounded-md border bg-background px-2 text-sm"
            />
            <Button variant="outline" size="sm" onClick={submit}>
              Search
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <EmptyState
              icon={Notebook}
              message="No agents in this company yet. Hire one from the Board to start collecting notes."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Notebook}
              message="No notes yet. Start the Reflector (PETAGENT_REFLECTOR_ENABLED=true) and run an agent."
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((n) => (
                <li key={n.id} className="rounded-md border p-3">
                  <div className="mb-1 text-xs text-muted-foreground">
                    <span className="font-mono">{n.id}</span>
                    {" · "}
                    <span>[{n.scope}]</span>
                    {n.noteType ? ` · ${n.noteType}` : ""}
                    {n.createdAt ? ` · ${new Date(n.createdAt).toLocaleString()}` : ""}
                  </div>
                  <pre className="whitespace-pre-wrap text-sm">{n.content}</pre>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
