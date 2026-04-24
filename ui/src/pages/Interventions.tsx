import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Download, Inbox as InboxIcon, Shield } from "lucide-react";
import {
  emotionalIncidentsApi,
  type EmotionalIncident,
} from "../api/emotional-incidents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import {
  collectFilterOptions,
  filterIncidents,
  interventionContentPreview,
  toCsv,
  type InterventionFilter,
} from "../lib/interventions-export";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SINCE_DAYS_OPTIONS = [1, 7, 30, 90];
const DEFAULT_SINCE_DAYS = 30;

export function Interventions() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [sinceDays, setSinceDays] = useState(DEFAULT_SINCE_DAYS);
  const [filter, setFilter] = useState<InterventionFilter>({});

  useEffect(() => {
    setBreadcrumbs([{ label: "Interventions" }]);
  }, [setBreadcrumbs]);

  const query = useQuery({
    queryKey: queryKeys.emotionalIncidents.list(
      selectedCompanyId ?? "__none__",
      sinceDays,
      filter.agentId,
    ),
    queryFn: () =>
      emotionalIncidentsApi.list(selectedCompanyId ?? "", {
        sinceDays,
        agentId: filter.agentId,
        limit: 500,
      }),
    enabled: Boolean(selectedCompanyId),
  });

  const incidents = query.data ?? [];
  const filtered = useMemo(
    () => filterIncidents(incidents, filter),
    [incidents, filter],
  );
  const options = useMemo(() => collectFilterOptions(incidents), [incidents]);

  const handleExportCsv = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.download = `emotional-incidents-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={Brain}
        message="Select a company from the switcher to view its emotional-intervention timeline."
      />
    );
  }

  if (query.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5" aria-hidden />
              <CardTitle>Emotional interventions</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-sm text-muted-foreground">
                Window
                <select
                  value={sinceDays}
                  onChange={(e) => setSinceDays(Number(e.target.value))}
                  className="rounded border border-input bg-background px-2 py-1 text-sm"
                >
                  {SINCE_DAYS_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      last {n}d
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filtered.length === 0}>
                <Download className="mr-1 h-4 w-4" aria-hidden />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FilterBar
            filter={filter}
            options={options}
            onChange={setFilter}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            <Shield className="mr-1 inline h-3 w-3" aria-hidden />
            Intervention content is redacted server-side according to the
            configured transparency γ. When γ is set to <code>opaque</code>
            or <code>semi</code>, the payload fields below will show
            "[redacted by transparency policy]".
          </p>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          message={`No emotional-intervention incidents in the last ${sinceDays} days matching your filters.`}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterBarProps {
  filter: InterventionFilter;
  options: ReturnType<typeof collectFilterOptions>;
  onChange: (next: InterventionFilter) => void;
}

function FilterBar({ filter, options, onChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="search"
        value={filter.search ?? ""}
        onChange={(e) => onChange({ ...filter, search: e.target.value || undefined })}
        placeholder="Search ids / notes / kind …"
        className="min-w-[220px] flex-1 rounded border border-input bg-background px-2 py-1"
      />
      <select
        value={filter.agentId ?? ""}
        onChange={(e) => onChange({ ...filter, agentId: e.target.value || undefined })}
        className="rounded border border-input bg-background px-2 py-1"
      >
        <option value="">All agents</option>
        {options.agents.map((a) => (
          <option key={a} value={a}>
            {a.slice(0, 8)}
          </option>
        ))}
      </select>
      <select
        value={filter.classification ?? ""}
        onChange={(e) => onChange({ ...filter, classification: e.target.value || undefined })}
        className="rounded border border-input bg-background px-2 py-1"
      >
        <option value="">All severities</option>
        {options.classifications.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={filter.outcome ?? ""}
        onChange={(e) => onChange({ ...filter, outcome: e.target.value || undefined })}
        className="rounded border border-input bg-background px-2 py-1"
      >
        <option value="">All outcomes</option>
        {options.outcomes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {(filter.agentId || filter.classification || filter.outcome || filter.search) && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          Clear
        </Button>
      )}
    </div>
  );
}

function IncidentRow({ incident }: { incident: EmotionalIncident }) {
  const detected = incident.detectedAt ? new Date(incident.detectedAt) : null;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs text-muted-foreground">
            {incident.id.slice(0, 8)}
          </span>
          {detected && !isNaN(detected.getTime()) && (
            <span className="text-xs text-muted-foreground">
              {detected.toLocaleString()}
            </span>
          )}
          <SeverityBadge classification={incident.classification} />
          <span className="text-xs">agent {incident.agentId.slice(0, 8)}</span>
          {incident.interventionKind && (
            <span className="rounded bg-muted px-1 py-0.5 text-xs">
              {incident.interventionKind}
            </span>
          )}
          <OutcomeBadge outcome={incident.outcome} />
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {interventionContentPreview(incident) || <em>no content</em>}
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ classification }: { classification: string | null }) {
  const tone =
    classification === "severe"
      ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
      : classification === "moderate"
        ? "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100"
        : classification === "mild"
          ? "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}>
      {classification ?? "unknown"}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const tone =
    outcome === "recovered"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      : outcome === "escalated"
        ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
        : outcome === "pending"
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${tone}`}>
      {outcome ?? "pending"}
    </span>
  );
}
