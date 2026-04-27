import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { skillCandidatesApi, type DigestRunSummary } from "@/api/skillCandidates";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function currentIsoWeek(): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function shiftWeek(iso: string, delta: number): string {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const week = Number(m[2]);
  // Build the Monday of the input week, shift by 7*delta days, re-encode.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const target = new Date(week1Mon);
  target.setUTCDate(week1Mon.getUTCDate() + (week - 1 + delta) * 7);
  // Re-encode
  const date = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function fmtDate(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export function SkillMiningDigest() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId } = useCompany();
  const [week, setWeek] = useState<string>(() => currentIsoWeek());
  const isCurrent = week === currentIsoWeek();

  useEffect(() => {
    setBreadcrumbs([{ label: "Skills" }, { label: "Weekly Digest" }]);
  }, [setBreadcrumbs]);

  const query = useQuery({
    queryKey: queryKeys.skillCandidates.digest(selectedCompanyId ?? "", week),
    queryFn: () => skillCandidatesApi.digest(selectedCompanyId!, week),
    enabled: !!selectedCompanyId,
  });

  const data = query.data;

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a company to view the weekly digest.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Skill Mining — Weekly Digest
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recap of mining cycles, candidate dispositions, and skills promoted this week.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setWeek(shiftWeek(week, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="font-mono text-sm px-3 py-1 rounded border min-w-[120px] text-center">
          {week}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setWeek(shiftWeek(week, 1))}
          disabled={isCurrent}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isCurrent && (
          <Button variant="ghost" size="sm" onClick={() => setWeek(currentIsoWeek())}>
            Jump to current week
          </Button>
        )}
        {data && (
          <span className="text-xs text-muted-foreground ml-2">
            {fmtDate(data.weekStart)} → {fmtDate(data.weekEnd)}
          </span>
        )}
      </div>

      {query.isLoading && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}

      {query.error && (
        <div className="border border-destructive/50 bg-destructive/10 text-destructive p-3 rounded text-sm">
          {query.error instanceof Error ? query.error.message : "Failed to load digest"}
        </div>
      )}

      {data && data.runs.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No mining cycles fired this week.{" "}
            <Link to="/skills/candidates" className="underline">
              Run mining now
            </Link>{" "}
            to generate the first.
          </CardContent>
        </Card>
      )}

      {data && data.runs.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Sparkles className="h-4 w-4" />}
              label="Mining cycles"
              value={data.totals.runs}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Notes scanned"
              value={data.totals.notesScanned}
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
              label="Promoted skills"
              value={data.totals.promoted}
            />
            <StatCard
              icon={<XCircle className="h-4 w-4 text-muted-foreground" />}
              label="Rejected"
              value={data.totals.rejected}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Candidate dispositions this week</CardTitle>
              <CardDescription>
                Pending {data.totals.pending} · Approved {data.totals.approved} · Rejected{" "}
                {data.totals.rejected} · Promoted {data.totals.promoted}{" "}
                <span className="text-muted-foreground">
                  (of {data.totals.candidatesCreated} candidates created)
                </span>
              </CardDescription>
            </CardHeader>
          </Card>

          {data.topPromoted.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top promoted skills</CardTitle>
                <CardDescription>
                  Approved + promoted to <span className="font-mono">trial</span> Skills this week.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.topPromoted.map((p) => (
                  <div
                    key={p.candidateId}
                    className="flex items-center justify-between gap-3 text-sm border-b last:border-b-0 pb-2 last:pb-0"
                  >
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs font-mono text-muted-foreground">{p.name}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.promotedAt ? fmtDateTime(p.promotedAt) : "—"}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Mining cycles ({data.runs.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.runs.map((r) => (
                <RunRow key={r.miningRunId} run={r} />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="shrink-0">{icon}</div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function RunRow({ run }: { run: DigestRunSummary }) {
  return (
    <div className="border-b last:border-b-0 pb-2 last:pb-0 text-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-mono text-xs text-muted-foreground">
          {fmtDateTime(run.firedAt)} · {run.triggeredBy}
        </div>
        <div className="text-xs text-muted-foreground">
          window {fmtDate(run.windowStart)} → {fmtDate(run.windowEnd)}
        </div>
      </div>
      <div className="text-xs mt-1 flex gap-3 flex-wrap">
        <span>scanned <strong>{run.notesScanned}</strong> notes</span>
        <span>created <strong>{run.candidatesCreated}</strong> candidates</span>
        {run.candidatesCreated > 0 && (
          <span className="text-muted-foreground">
            ({run.pending} pending · {run.approved} approved · {run.rejected} rejected · {run.promoted} promoted)
          </span>
        )}
        {run.llmModel && <span className="text-muted-foreground">· {run.llmModel}</span>}
      </div>
      {run.skippedReason && (
        <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex gap-1.5 items-start">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          {run.skippedReason}
        </div>
      )}
      {run.fellBackToEmpty && !run.skippedReason && (
        <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
          LLM returned malformed JSON → no candidates parsed.
        </div>
      )}
    </div>
  );
}

export default SkillMiningDigest;
