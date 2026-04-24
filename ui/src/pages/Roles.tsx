import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { roleTemplatesApi } from "../api/role-templates";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { groupRoleTemplates } from "../lib/role-templates-grouping";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Roles() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const [newRoleYaml, setNewRoleYaml] = useState("");
  const [showNewRoleEditor, setShowNewRoleEditor] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Roles" }]);
  }, [setBreadcrumbs]);

  const query = useQuery({
    queryKey: ["role-templates"],
    queryFn: () => roleTemplatesApi.list(),
    staleTime: 30_000,
  });

  const groups = useMemo(
    () => groupRoleTemplates(query.data ?? [], { search }),
    [query.data, search],
  );

  if (query.isLoading) return <PageSkeleton />;

  const hasAny = (query.data ?? []).length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" aria-hidden />
              <CardTitle>Role templates</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roles …"
                className="min-w-[220px] rounded border border-input bg-background px-2 py-1 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewRoleEditor(!showNewRoleEditor)}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                New role
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Role templates are resolved in priority order: <strong>user</strong> (<code>~/.petagent/roles</code>) overrides <strong>project</strong> (<code>./.petagent/roles</code>) overrides <strong>plugin</strong> overrides <strong>built-in</strong>. Edit role markdown files directly on disk — the FS watcher picks up changes between sessions (spec §20).
          </p>
        </CardContent>
      </Card>

      {showNewRoleEditor && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New role (paste YAML + prompt)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              This V1 editor is read-only feedback: paste your role template and save the rendered YAML to <code>~/.petagent/roles/&lt;name&gt;.md</code>. A write endpoint is on the V2 roadmap (§17.3).
            </p>
            <textarea
              value={newRoleYaml}
              onChange={(e) => setNewRoleYaml(e.target.value)}
              placeholder={`---
roleType: worker/custom
description: …
tools: [FileRead, Grep]
---

You are …`}
              rows={12}
              className="w-full rounded border border-input bg-background p-2 font-mono text-xs"
              spellCheck={false}
            />
          </CardContent>
        </Card>
      )}

      {!hasAny ? (
        <EmptyState
          icon={Users}
          message="No role templates discovered. Check that the built-in-roles directory ships with your PetAgent install."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          message={`No role templates match "${search}".`}
        />
      ) : (
        groups.map((group) => (
          <Card key={group.source}>
            <CardHeader>
              <CardTitle className="text-sm">
                {group.label}{" "}
                <span className="text-muted-foreground">
                  ({group.templates.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.templates.map((template) => (
                <div
                  key={`${group.source}:${template.roleType}`}
                  className="rounded border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{template.roleType}</span>
                    {template.model && (
                      <span className="rounded bg-muted px-1 py-0.5 text-xs">
                        {template.model}
                      </span>
                    )}
                    {template.isolation !== "none" && (
                      <span className="rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                        isolation={template.isolation}
                      </span>
                    )}
                    {template.background && (
                      <span className="rounded bg-muted px-1 py-0.5 text-xs">background</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs font-normal">
                    {template.promptPreview || <em>(no prompt)</em>}
                  </pre>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {template.tools.length > 0 && (
                      <span>
                        <strong>tools:</strong> {template.tools.join(", ")}
                      </span>
                    )}
                    {template.disallowedTools.length > 0 && (
                      <span className="text-red-700 dark:text-red-300">
                        <strong>disallowed:</strong> {template.disallowedTools.join(", ")}
                      </span>
                    )}
                    {template.skills.length > 0 && (
                      <span>
                        <strong>skills:</strong> {template.skills.join(", ")}
                      </span>
                    )}
                    {template.mcpServers.length > 0 && (
                      <span>
                        <strong>mcp:</strong> {template.mcpServers.join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    {template.path}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
