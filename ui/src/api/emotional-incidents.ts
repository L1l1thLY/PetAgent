import { api } from "./client";

/**
 * Response shape from GET /api/companies/:companyId/emotional-incidents.
 * Server-side γ redaction may replace `signalPayload` / `interventionPayload`
 * with `{ redacted: true, note: "..." }`. Callers must not assume raw content
 * is present.
 */
export interface EmotionalIncident {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  runId: string | null;
  detectedAt: string | null;
  signalType: string;
  classification: string | null;
  confidence: number | null;
  signalPayload: Record<string, unknown> | null;
  interventionKind: string | null;
  interventionPayload: Record<string, unknown> | null;
  dispatchedAt: string | null;
  outcome: string | null;
  outcomeNotes: string | null;
  outcomeResolvedAt: string | null;
}

export interface EmotionalIncidentsListParams {
  sinceDays?: number;
  limit?: number;
  agentId?: string;
}

export const emotionalIncidentsApi = {
  list: (companyId: string, params: EmotionalIncidentsListParams = {}) => {
    const qs = new URLSearchParams();
    if (typeof params.sinceDays === "number") qs.set("sinceDays", String(params.sinceDays));
    if (typeof params.limit === "number") qs.set("limit", String(params.limit));
    if (params.agentId) qs.set("agentId", params.agentId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<EmotionalIncident[]>(
      `/companies/${companyId}/emotional-incidents${suffix}`,
    );
  },
};
