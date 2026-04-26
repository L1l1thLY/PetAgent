import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import {
  skillCandidatesApi,
  type MineCycleResult,
  type SkillCandidate,
} from "@/api/skillCandidates";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  promoted: "Promoted",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  rejected: "bg-muted text-muted-foreground",
  promoted: "bg-green-500/15 text-green-700 dark:text-green-400",
};

export function SkillCandidates() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId } = useCompany();
  const [status, setStatus] = useState<string>("pending");
  const [lastRun, setLastRun] = useState<MineCycleResult | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Skills" }, { label: "Candidates" }]);
  }, [setBreadcrumbs]);

  const query = useQuery({
    queryKey: queryKeys.skillCandidates.list(selectedCompanyId ?? "", status),
    queryFn: () =>
      skillCandidatesApi.list(selectedCompanyId!, {
        status: status === "all" ? undefined : (status as SkillCandidate["status"]),
      }),
    enabled: !!selectedCompanyId,
  });

  const runNowMutation = useMutation({
    mutationFn: () => skillCandidatesApi.runNow(selectedCompanyId!),
    onSuccess: async (result) => {
      setLastRun(result);
      await queryClient.invalidateQueries({
        queryKey: ["skill-candidates", selectedCompanyId],
      });
    },
  });

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a company to view skill candidates.
      </div>
    );
  }

  const items = query.data?.items ?? [];

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Lightbulb className="h-5 w-5" /> Skill Candidates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Patterns the SkillMiner found in your agents' notes. Approve to
            promote into trial Skills; reject to dismiss. Mining runs weekly
            (Mondays 02:00) when{" "}
            <code className="text-xs">PETAGENT_SKILL_MINING_ENABLED=true</code>;
            you can also trigger it manually below.
          </p>
        </div>
        <Button
          onClick={() => runNowMutation.mutate()}
          disabled={runNowMutation.isPending}
          className="shrink-0"
        >
          {runNowMutation.isPending ? (
            <RotateCw className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          Run mining now
        </Button>
      </div>

      {lastRun && (
        <Card className="border-sky-500/40 bg-sky-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Last run</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              Window: {fmtDate(lastRun.windowStart)} → {fmtDate(lastRun.windowEnd)}
            </div>
            <div>
              Notes scanned: <strong>{lastRun.notesScanned}</strong> · Candidates
              created: <strong>{lastRun.candidatesCreated}</strong>
            </div>
            {lastRun.skippedReason && (
              <div className="text-amber-700 dark:text-amber-400 text-xs flex gap-1.5 items-start">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Skipped: {lastRun.skippedReason}
              </div>
            )}
            {lastRun.candidatesCreated === 0 && !lastRun.skippedReason && (
              <div className="text-muted-foreground text-xs">
                No new patterns met the threshold. Try lowering it next week, or
                wait for more notes to accumulate.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {runNowMutation.error && (
        <div className="border border-destructive/50 bg-destructive/10 text-destructive p-3 rounded text-sm">
          {runNowMutation.error instanceof Error
            ? runNowMutation.error.message
            : "Run failed"}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="promoted">Promoted</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {query.isLoading ? "loading…" : `${items.length} item${items.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {query.error ? (
        <div className="border border-destructive/50 bg-destructive/10 text-destructive p-3 rounded text-sm">
          {query.error instanceof Error ? query.error.message : "Failed to load"}
        </div>
      ) : items.length === 0 && !query.isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {status === "pending"
              ? "No pending candidates yet. Click Run mining now to scan recent notes."
              : "No candidates match this filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <CandidateCard key={c.id} candidate={c} companyId={selectedCompanyId} />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  companyId,
}: {
  candidate: SkillCandidate;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  function invalidate() {
    return queryClient.invalidateQueries({
      queryKey: ["skill-candidates", companyId],
    });
  }

  const approveMutation = useMutation({
    mutationFn: () => skillCandidatesApi.approve(companyId, candidate.id),
    onSuccess: () => invalidate(),
  });
  const rejectMutation = useMutation({
    mutationFn: () => skillCandidatesApi.reject(companyId, candidate.id),
    onSuccess: () => invalidate(),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;
  const isPending = candidate.status === "pending";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{candidate.title}</CardTitle>
              <Badge className={STATUS_BADGE[candidate.status] ?? ""}>
                {STATUS_LABELS[candidate.status] ?? candidate.status}
              </Badge>
            </div>
            <CardDescription className="text-xs font-mono mt-0.5">
              {candidate.name}
            </CardDescription>
          </div>
          {isPending && (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => approveMutation.mutate()}
                disabled={busy}
              >
                {approveMutation.isPending ? (
                  <RotateCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">Approve</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => rejectMutation.mutate()}
                disabled={busy}
              >
                <XCircle className="h-3.5 w-3.5" />
                <span className="ml-1">Reject</span>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2 text-sm">
        {candidate.rationale && (
          <div className="text-muted-foreground italic">{candidate.rationale}</div>
        )}
        <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
          <span>
            <strong>{candidate.patternFrequency}</strong> source notes
          </span>
          {candidate.agentId && <span>· agent {candidate.agentId.slice(0, 8)}</span>}
          {candidate.llmModel && <span>· {candidate.llmModel}</span>}
          {candidate.windowStart && candidate.windowEnd && (
            <span>
              · {fmtDate(candidate.windowStart)}—{fmtDate(candidate.windowEnd)}
            </span>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? "Hide body" : "Show body"}
        </button>
        {expanded && (
          <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/40 rounded p-3 mt-2">
            {candidate.body}
          </pre>
        )}

        {candidate.promotedSkillName && (
          <div className="text-xs text-green-700 dark:text-green-400 pt-2 border-t mt-2">
            Promoted to skill: <code>{candidate.promotedSkillName}</code>
          </div>
        )}

        {(approveMutation.error || rejectMutation.error) && (
          <div className="text-xs text-destructive pt-1">
            {(approveMutation.error || rejectMutation.error)?.toString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDate(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}
