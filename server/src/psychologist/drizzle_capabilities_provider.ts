/**
 * Drizzle-backed `CapabilitiesProvider` for the Psychologist (#1d).
 *
 * Resolves an agent's intervention-tier capabilities by:
 *   1. Reading `agents.adapterType`.
 *   2. Looking the type up in `PSYCH_CAPABILITY_DEFAULTS`.
 *   3. Falling back to `PSYCH_CAPABILITY_FALLBACK` (Board Comment only)
 *      for unknown adapters, or all-false if the row is missing.
 *
 * Lives in the server package to keep `@petagent/psychologist` free of
 * `@petagent/db` imports (Group 7 design rule).
 */

import { eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agents } from "@petagent/db";
import type { AdapterCapabilities, CapabilitiesProvider } from "@petagent/psychologist";
import {
  PSYCH_CAPABILITY_DEFAULTS,
  PSYCH_CAPABILITY_FALLBACK,
} from "./psych_capability_registry.js";

const ALL_FALSE: AdapterCapabilities = Object.freeze({
  supportsInstructionsBundle: false,
  supportsBoardComment: false,
  supportsIssuePause: false,
  supportsIssueSplit: false,
});

export interface DrizzleCapabilitiesProviderDeps {
  db: Db;
  defaults?: Readonly<Record<string, AdapterCapabilities>>;
  fallback?: AdapterCapabilities;
}

export class DrizzleCapabilitiesProvider implements CapabilitiesProvider {
  private readonly db: Db;
  private readonly defaults: Readonly<Record<string, AdapterCapabilities>>;
  private readonly fallback: AdapterCapabilities;

  constructor(deps: DrizzleCapabilitiesProviderDeps) {
    this.db = deps.db;
    this.defaults = deps.defaults ?? PSYCH_CAPABILITY_DEFAULTS;
    this.fallback = deps.fallback ?? PSYCH_CAPABILITY_FALLBACK;
  }

  async forAgent(agentId: string): Promise<AdapterCapabilities> {
    const rows = await this.db
      .select({ adapterType: agents.adapterType })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    const row = rows[0];
    if (!row) return ALL_FALSE;
    return this.defaults[row.adapterType] ?? this.fallback;
  }
}
