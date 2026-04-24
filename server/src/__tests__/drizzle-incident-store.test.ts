/**
 * Compile-time + structural-contract tests for DrizzleIncidentStore.
 *
 * The insert/update/query paths hit Postgres; they are covered by the
 * existing server integration suites when the embedded DB is
 * available. This file focuses on what can be verified without a live
 * DB:
 *   - The class satisfies the IncidentStore interface at the
 *     structural level (sanity check on the port mapping).
 *   - The constructor doesn't reach into drizzle during construction
 *     (lazy query execution only on method call).
 */
import { describe, it, expect } from "vitest";
import type { Db } from "@petagent/db";
import type { IncidentStore } from "@petagent/psychologist";
import { DrizzleIncidentStore } from "../psychologist/drizzle_incident_store.js";

describe("DrizzleIncidentStore shape", () => {
  it("constructor is cheap and does not throw before any query", () => {
    const fakeDb = {} as unknown as Db;
    expect(() => new DrizzleIncidentStore(fakeDb)).not.toThrow();
  });

  it("satisfies the IncidentStore port structurally", () => {
    const store: IncidentStore = new DrizzleIncidentStore({} as unknown as Db);
    expect(typeof store.insert).toBe("function");
    expect(typeof store.updateOutcome).toBe("function");
    expect(typeof store.recentForAgent).toBe("function");
    expect(typeof store.topSignalsForAgent).toBe("function");
  });
});
