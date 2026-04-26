import { api } from "./client";

export type SkillCandidateStatus = "pending" | "approved" | "rejected" | "promoted";

export interface SkillCandidate {
  id: string;
  companyId: string;
  agentId: string | null;
  status: SkillCandidateStatus;
  name: string;
  title: string;
  body: string;
  rationale: string | null;
  sourceNoteIds: string[];
  patternFrequency: number;
  llmModel: string | null;
  llmProviderId: string | null;
  miningRunId: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByActorId: string | null;
  promotedSkillName: string | null;
}

export interface MineCycleResult {
  miningRunId: string;
  companyId: string;
  notesScanned: number;
  candidatesCreated: number;
  fellBackToEmpty: boolean;
  windowStart: string;
  windowEnd: string;
  skippedReason?: string;
}

export const skillCandidatesApi = {
  list: (
    companyId: string,
    opts: { status?: SkillCandidateStatus; limit?: number } = {},
  ) => {
    const search = new URLSearchParams();
    if (opts.status) search.set("status", opts.status);
    if (opts.limit !== undefined) search.set("limit", String(opts.limit));
    const qs = search.toString();
    return api.get<{ items: SkillCandidate[]; total: number }>(
      `/companies/${companyId}/skill-candidates${qs ? `?${qs}` : ""}`,
    );
  },
  approve: (companyId: string, id: string) =>
    api.post<{ candidate: SkillCandidate; skill: { id: string; name: string } }>(
      `/companies/${companyId}/skill-candidates/${id}/approve`,
      {},
    ),
  reject: (companyId: string, id: string) =>
    api.post<{ candidate: SkillCandidate }>(
      `/companies/${companyId}/skill-candidates/${id}/reject`,
      {},
    ),
  runNow: (companyId: string, opts: { windowDays?: number } = {}) =>
    api.post<MineCycleResult>(
      `/companies/${companyId}/skill-mining/run-now`,
      opts,
    ),
};
