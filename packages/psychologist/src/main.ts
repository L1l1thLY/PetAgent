import type { HookBus, HookEvent } from "@petagent/hooks";
import { BehaviorMonitor } from "./behavior_monitor.js";
import { craftIntervention } from "./intervention_crafter.js";
import { InterventionDispatcher } from "./dispatcher.js";
import type {
  ActiveSeverity,
  BehavioralRecordsStore,
  CapabilitiesProvider,
  ClassifierClient,
  ClassifierResult,
  IncidentStore,
  Severity,
} from "./types.js";

export interface PsychologistDeps {
  bus: HookBus;
  monitor: BehaviorMonitor;
  classifier: ClassifierClient;
  dispatcher: InterventionDispatcher;
  incidents: IncidentStore;
  capabilities: CapabilitiesProvider;
  records: BehavioralRecordsStore;
  cooldownMs?: number;
  recentOutputDepth?: number;
  subscriberName?: string;
}

const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_OUTPUT_DEPTH = 5;
const DEFAULT_NAME = "psychologist";

const ACTIVE_TYPES = new Set<HookEvent["type"]>(["agent.output", "heartbeat.ended"]);

export class Psychologist {
  private readonly cooldownMs: number;
  private readonly recentOutputDepth: number;
  private readonly name: string;
  private readonly lastInterventionAt = new Map<string, number>();

  constructor(private readonly deps: PsychologistDeps) {
    this.cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.recentOutputDepth = deps.recentOutputDepth ?? DEFAULT_OUTPUT_DEPTH;
    this.name = deps.subscriberName ?? DEFAULT_NAME;
  }

  async start(): Promise<void> {
    this.deps.bus.register({
      name: this.name,
      filter: (e) => ACTIVE_TYPES.has(e.type),
      handle: (e) => this.onEvent(e),
    });
  }

  async stop(): Promise<void> {
    this.deps.bus.unregister(this.name);
  }

  private async onEvent(event: HookEvent): Promise<void> {
    if (!event.agentId) return;

    const behavioral = await this.deps.monitor.check(event.agentId);
    if (behavioral.behavioralSeverity === "none") return;

    const recentOutputs = await this.deps.records.recentOutputs(
      event.agentId,
      this.recentOutputDepth,
    );
    const classified = await this.deps.classifier.classify(
      recentOutputs.map((o) => o.text),
      { issueContext: event.issueId ?? "unknown" },
    );
    if (classified.recommended_intervention === "none") return;

    const severity = classified.recommended_intervention as ActiveSeverity;
    const cooldownKey = `${event.agentId}:${severity}`;
    const lastAt = this.lastInterventionAt.get(cooldownKey);
    const now = Date.now();
    if (lastAt !== undefined && now - lastAt < this.cooldownMs) return;
    this.lastInterventionAt.set(cooldownKey, now);

    const content = craftIntervention(severity, classified.signals);
    const capabilities = await this.deps.capabilities.forAgent(event.agentId);
    const dispatched = await this.deps.dispatcher.dispatch({
      targetAgentId: event.agentId,
      severity,
      content,
      capabilities,
    });

    await this.deps.incidents.insert({
      companyId: event.companyId,
      agentId: event.agentId,
      issueId: event.issueId,
      runId: pickRunId(event),
      signalType: signalSourceFor(behavioral.behavioralSeverity, classified),
      classification: severity,
      confidence: classified.distress_level,
      signalPayload: {
        behavioral,
        classifier: classified satisfies ClassifierResult,
      },
      interventionKind: dispatched.kind,
      interventionPayload: { content, succeeded: dispatched.succeeded },
      outcome: "pending",
    });
  }
}

function pickRunId(event: HookEvent): string | undefined {
  const runId = event.payload?.runId;
  return typeof runId === "string" ? runId : undefined;
}

function signalSourceFor(behavioral: Severity, classified: ClassifierResult): string {
  if (behavioral !== "none" && classified.recommended_intervention !== "none") return "both";
  if (behavioral !== "none") return "behavioral";
  if (classified.recommended_intervention !== "none") return "classifier";
  return "none";
}
