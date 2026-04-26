/**
 * Warm pool port (spec §21.2).
 *
 * The platform's hire-latency target is 3s from CLI return to agent
 * visible on the board. Today that's met without effort — RoleTemplateLoader
 * caches role templates at boot, and hire is a single DB INSERT.
 *
 * The interesting case is when PetAgent's native runtime becomes the
 * live heartbeat dispatch path (architecturally ready in M1, runtime
 * activation is M3 territory). At that point, fresh agents pay a
 * runtime cold-start cost on first invocation. The mitigation is a
 * warm pool: pre-allocated runtime instances (with system prompt
 * loaded, ready to receive context) that hire dequeues from, with a
 * background routine refilling the pool.
 *
 * This module ships the port (`WarmPool`) plus two reference
 * implementations:
 *   - `NoOpWarmPool` — current default; every acquire returns null
 *     so callers fall back to the cold-start path.
 *   - `StaticWarmPool` — in-memory, useful for tests and for early
 *     experimentation.
 *
 * The drizzle-backed pool with a refill routine lands in M3 alongside
 * the runtime activation work.
 */

export interface WarmPoolEntry {
  /** Stable id of the pre-warmed instance. */
  readonly id: string;
  readonly role: string;
  readonly companyId: string;
  readonly warmedAt: Date;
}

export interface WarmPool {
  /** Acquire one warmed instance for the given role+company; null if pool is empty. */
  acquire(input: { role: string; companyId: string }): Promise<WarmPoolEntry | null>;
  /** Return an entry to the pool (e.g. when a hire fails downstream). */
  release(entry: WarmPoolEntry): Promise<void>;
  /** Current depth for a role (cross-company aggregate). Diagnostics only. */
  count(role: string): Promise<number>;
}

export class NoOpWarmPool implements WarmPool {
  async acquire(_input: { role: string; companyId: string }): Promise<WarmPoolEntry | null> {
    return null;
  }
  async release(_entry: WarmPoolEntry): Promise<void> {
    // intentional no-op
  }
  async count(_role: string): Promise<number> {
    return 0;
  }
}

export class StaticWarmPool implements WarmPool {
  private readonly entries: WarmPoolEntry[];

  constructor(initial: ReadonlyArray<WarmPoolEntry> = []) {
    this.entries = [...initial];
  }

  async acquire(input: { role: string; companyId: string }): Promise<WarmPoolEntry | null> {
    const idx = this.entries.findIndex(
      (e) => e.role === input.role && e.companyId === input.companyId,
    );
    if (idx === -1) return null;
    const [taken] = this.entries.splice(idx, 1);
    return taken;
  }

  async release(entry: WarmPoolEntry): Promise<void> {
    this.entries.push(entry);
  }

  async count(role: string): Promise<number> {
    return this.entries.filter((e) => e.role === role).length;
  }
}
