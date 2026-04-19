// Spec §3.3 — default pronounceable worker names for new companies.
// Ordered so first 4 cover the 4 Worker variants in sequence
// (explorer, planner, executor, reviewer).

import type { PluginRole } from "./plugin.js";

export const DEFAULT_WORKER_NAMES: ReadonlyArray<string> = [
  "Atlas",
  "Beacon",
  "Corvus",
  "Delta",
  "Echo",
  "Fable",
  "Grove",
  "Haven",
  "Indigo",
  "Juno",
];

export const DEFAULT_ROLE_NAME: Record<PluginRole, string> = {
  coordinator: "Chief",
  "worker/explorer": "Atlas",
  "worker/planner": "Beacon",
  "worker/executor": "Corvus",
  "worker/reviewer": "Delta",
  psychologist: "Echo",
};

export function pickWorkerName(index: number): string {
  return DEFAULT_WORKER_NAMES[index % DEFAULT_WORKER_NAMES.length];
}
