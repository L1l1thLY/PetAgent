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

/**
 * Pick a default name for a freshly-hired agent of the given role.
 * The role's canonical default (`DEFAULT_ROLE_NAME[role]`) is tried first;
 * if that is taken, the pool of pronounceable names is scanned; if the
 * whole pool is exhausted, `Worker-N` is used where N is the smallest
 * positive integer not already in use. Comparisons are case-insensitive.
 */
export function generateDefaultName(
  existingNames: readonly string[],
  role: PluginRole,
): string {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  const preferred = DEFAULT_ROLE_NAME[role];
  if (!taken.has(preferred.toLowerCase())) return preferred;
  for (const candidate of DEFAULT_WORKER_NAMES) {
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  for (let i = 1; i < 1_000_000; i += 1) {
    const candidate = `Worker-${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error("generateDefaultName exhausted the Worker-N fallback space");
}
