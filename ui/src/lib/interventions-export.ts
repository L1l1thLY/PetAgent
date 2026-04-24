import type { EmotionalIncident } from "../api/emotional-incidents";

export interface InterventionFilter {
  agentId?: string;
  classification?: string;
  outcome?: string;
  search?: string;
}

/**
 * Filter a list of incidents client-side. Kept pure so the Interventions
 * page doesn't re-round-trip to the server on every filter change.
 */
export function filterIncidents(
  incidents: ReadonlyArray<EmotionalIncident>,
  filter: InterventionFilter,
): EmotionalIncident[] {
  const needle = filter.search?.trim().toLowerCase();
  return incidents.filter((incident) => {
    if (filter.agentId && incident.agentId !== filter.agentId) return false;
    if (filter.classification && incident.classification !== filter.classification) return false;
    if (filter.outcome && incident.outcome !== filter.outcome) return false;
    if (needle) {
      const fields = [
        incident.id,
        incident.agentId,
        incident.issueId ?? "",
        incident.classification ?? "",
        incident.interventionKind ?? "",
        incident.outcome ?? "",
        incident.outcomeNotes ?? "",
        incident.signalType,
      ];
      if (!fields.some((field) => field.toLowerCase().includes(needle))) return false;
    }
    return true;
  });
}

const CSV_COLUMNS = [
  "id",
  "detected_at",
  "agent_id",
  "issue_id",
  "run_id",
  "signal_type",
  "classification",
  "confidence",
  "intervention_kind",
  "dispatched_at",
  "outcome",
  "outcome_notes",
  "outcome_resolved_at",
] as const;

export function toCsv(incidents: ReadonlyArray<EmotionalIncident>): string {
  const header = CSV_COLUMNS.join(",");
  const rows = incidents.map((incident) => {
    return CSV_COLUMNS.map((col) => csvCell(cellValue(incident, col))).join(",");
  });
  return [header, ...rows].join("\n");
}

function cellValue(incident: EmotionalIncident, col: (typeof CSV_COLUMNS)[number]): unknown {
  switch (col) {
    case "id":
      return incident.id;
    case "detected_at":
      return incident.detectedAt;
    case "agent_id":
      return incident.agentId;
    case "issue_id":
      return incident.issueId;
    case "run_id":
      return incident.runId;
    case "signal_type":
      return incident.signalType;
    case "classification":
      return incident.classification;
    case "confidence":
      return incident.confidence;
    case "intervention_kind":
      return incident.interventionKind;
    case "dispatched_at":
      return incident.dispatchedAt;
    case "outcome":
      return incident.outcome;
    case "outcome_notes":
      return incident.outcomeNotes;
    case "outcome_resolved_at":
      return incident.outcomeResolvedAt;
  }
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Collect the list of unique filter option values from a batch of
 * incidents. Used to populate filter dropdowns dynamically.
 */
export function collectFilterOptions(
  incidents: ReadonlyArray<EmotionalIncident>,
): {
  classifications: string[];
  outcomes: string[];
  agents: string[];
} {
  const classifications = new Set<string>();
  const outcomes = new Set<string>();
  const agents = new Set<string>();
  for (const incident of incidents) {
    if (incident.classification) classifications.add(incident.classification);
    if (incident.outcome) outcomes.add(incident.outcome);
    agents.add(incident.agentId);
  }
  return {
    classifications: Array.from(classifications).sort(),
    outcomes: Array.from(outcomes).sort(),
    agents: Array.from(agents).sort(),
  };
}

/**
 * Return the human-facing "intervention content preview" string,
 * honoring server-side γ redaction. When the server already redacted
 * the payload, return "[redacted]" so the UI doesn't try to render
 * the redaction envelope as content.
 */
export function interventionContentPreview(
  incident: EmotionalIncident,
): string {
  const payload = incident.interventionPayload;
  if (!payload) return "";
  if (typeof payload.redacted === "boolean" && payload.redacted) {
    return "[redacted by transparency policy]";
  }
  if (typeof payload.content === "string") return payload.content;
  return JSON.stringify(payload);
}
