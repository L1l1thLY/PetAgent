/**
 * Composition wiring for the SkillMiner subsystem (M2 G4 MVP).
 *
 * The miner reuses the LLMRouter's `reflector` text transport (same
 * provider that writes Notes) — keeps cost on one model rather than
 * adding a fourth routing target. Future enhancement: a dedicated
 * "miner" routing target so users can pick a stronger Sonnet-tier
 * model per spec §5.3.
 */

import type { Db } from "@petagent/db";
import type { SkillMinerRunnerDeps } from "../skill-miner/runner.js";
import type { LLMRouter } from "./llm-router.js";

export interface SkillMinerCompositionDeps {
  db: Db;
  router: LLMRouter;
  windowDays?: number;
  maxNotes?: number;
  logger?: { info?(msg: string): void; warn?(msg: string, meta?: unknown): void };
}

export function buildSkillMinerRunnerDeps(
  deps: SkillMinerCompositionDeps,
): SkillMinerRunnerDeps {
  return {
    db: deps.db,
    transportFactory: () => {
      const route = deps.router.getTextTransport("reflector");
      if (route === null) return null;
      const desc = deps.router
        .describeRouting()
        .find((d) => d.subsystem === "reflector");
      return {
        transport: route.transport,
        model: route.model,
        providerId: desc?.providerId ?? "",
      };
    },
    windowDays: deps.windowDays,
    maxNotes: deps.maxNotes,
    logger: deps.logger,
  };
}
