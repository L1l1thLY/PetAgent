/**
 * Composition factory for the Psychologist subsystem (M2 G3 §4 — refactored).
 *
 * Returns null when `config.psychologistEnabled === false`. When enabled
 * builds the full Psychologist instance from M1 ports + #1d concrete
 * adapters. The classifier flavour now comes from LLMRouter:
 *   - router.getTextTransport("psychologist") returns null
 *       → BehavioralPassthroughClassifier (no-LLM fallback)
 *   - router returns {transport, model}
 *       → PromptedClassifier wired to that transport
 *
 * The router's source-of-truth could be petagent.config.yaml, or the
 * BC env-fallback path (ANTHROPIC_API_KEY synthesises an "anthropic"
 * provider). Either way, this composition no longer reads env directly.
 */

import {
  BehaviorMonitor,
  BehavioralPassthroughClassifier,
  InterventionDispatcher,
  PromptedClassifier,
  Psychologist,
  type ClassifierClient,
} from "@petagent/psychologist";
import type { HookBus } from "@petagent/hooks";
import type { Db } from "@petagent/db";
import { DrizzleIncidentStore } from "../psychologist/drizzle_incident_store.js";
import { DrizzleBehavioralRecordsStore } from "../psychologist/drizzle_behavioral_store.js";
import { DrizzleCapabilitiesProvider } from "../psychologist/drizzle_capabilities_provider.js";
import { ServicePsychologistActions } from "../psychologist/service_psychologist_actions.js";
import { issueService } from "../services/issues.js";
import { agentInstructionsService } from "../services/agent-instructions.js";
import type { Config } from "../config.js";
import type { LLMRouter } from "./llm-router.js";

export interface PsychologistFactoryDeps {
  db: Db;
  hookBus: HookBus;
  config: Pick<Config, "psychologistEnabled" | "psychologistActorAgentId">;
  router: LLMRouter;
  logger?: { warn(msg: string, meta?: unknown): void };
}

export interface PsychologistInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  classifierKind: "prompted" | "passthrough";
}

export function createPsychologist(deps: PsychologistFactoryDeps): PsychologistInstance | null {
  if (!deps.config.psychologistEnabled) return null;

  const incidents = new DrizzleIncidentStore(deps.db);
  const records = new DrizzleBehavioralRecordsStore(deps.db);
  const capabilities = new DrizzleCapabilitiesProvider({ db: deps.db });
  const monitor = new BehaviorMonitor(records);

  const route = deps.router.getTextTransport("psychologist");
  let classifier: ClassifierClient;
  let classifierKind: "prompted" | "passthrough";
  if (route !== null) {
    classifier = new PromptedClassifier(route.transport, { model: route.model });
    classifierKind = "prompted";
  } else {
    classifier = new BehavioralPassthroughClassifier();
    classifierKind = "passthrough";
  }

  const actions = new ServicePsychologistActions({
    db: deps.db,
    issueService: issueService(deps.db),
    agentInstructions: agentInstructionsService(),
    systemActorAgentId: deps.config.psychologistActorAgentId,
    logger: deps.logger,
  });

  const dispatcher = new InterventionDispatcher(actions);

  const psych = new Psychologist({
    bus: deps.hookBus,
    monitor,
    classifier,
    dispatcher,
    incidents,
    capabilities,
    records,
  });

  return {
    start: () => psych.start(),
    stop: () => psych.stop(),
    classifierKind,
  };
}
