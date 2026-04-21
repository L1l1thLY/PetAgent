export type Severity = "none" | "mild" | "moderate" | "severe";
export type ActiveSeverity = Exclude<Severity, "none">;

export interface BehavioralSignal {
  agentId: string;
  behavioralSeverity: Severity;
  signals: string[];
  details: Record<string, unknown>;
}

export interface ClassifierResult {
  distress_level: number;
  signals: string[];
  recommended_intervention: Severity;
}

export interface RunSummary {
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface OutputSample {
  text: string;
  length: number;
  createdAt: Date;
}

export interface ToolCallSample {
  succeeded: boolean;
  createdAt: Date;
}

export interface BehavioralRecordsStore {
  recentRuns(agentId: string, limit: number): Promise<RunSummary[]>;
  recentOutputLengths(agentId: string, limit: number): Promise<number[]>;
  recentToolCalls(agentId: string, limit: number): Promise<ToolCallSample[]>;
  recentOutputs(agentId: string, limit: number): Promise<OutputSample[]>;
}

export interface IncidentRecord {
  companyId: string;
  agentId: string;
  issueId?: string;
  runId?: string;
  signalType: string;
  classification: string;
  confidence: number;
  signalPayload: Record<string, unknown>;
  interventionKind: string;
  interventionPayload: Record<string, unknown>;
  outcome: "pending" | "recovered" | "escalated" | "no_action";
}

export interface IncidentStore {
  insert(record: IncidentRecord): Promise<{ id: string }>;
  updateOutcome(
    id: string,
    outcome: IncidentRecord["outcome"],
    notes?: string,
  ): Promise<void>;
  recentForAgent(
    agentId: string,
    limit: number,
  ): Promise<{ id: string; agentId: string; createdAt: Date }[]>;
  topSignalsForAgent(
    agentId: string,
    sinceDays: number,
  ): Promise<{ signal: string; count: number }[]>;
}

export interface ClassifierClient {
  classify(
    recentOutputs: string[],
    ctx: { issueContext: string },
  ): Promise<ClassifierResult>;
}

export interface AdapterCapabilities {
  supportsInstructionsBundle: boolean;
  supportsBoardComment: boolean;
  supportsIssuePause: boolean;
  supportsIssueSplit: boolean;
}

export interface PsychologistActions {
  injectInstructions(agentId: string, content: string): Promise<void>;
  postBoardComment(agentId: string, content: string): Promise<void>;
  pauseIssue(agentId: string): Promise<void>;
  splitIssue(agentId: string, reason: string): Promise<void>;
}

export interface CapabilitiesProvider {
  forAgent(agentId: string): Promise<AdapterCapabilities>;
}
