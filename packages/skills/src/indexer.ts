// Ported surface from hermes-agent/agent/prompt_builder.py L.465-674 (MIT License, Nous Research).
// See NOTICES.md for full attribution.
//
// M1 scope: LRU-based three-tier cache interface; embedding-backed semantic
// search lands in M2 (tied to pgvector and Notes storage).

export interface SkillSnippet {
  skillId: string;
  name: string;
  summary: string;
  excerpt: string;
  tokenCost: number;
}

export interface SkillIndexerQuery {
  intent: string;
  agentId?: string;
  maxResults?: number;
}

export interface SkillIndexer {
  query(q: SkillIndexerQuery): Promise<SkillSnippet[]>;
  invalidate(skillId?: string): void;
}

/**
 * Simple in-memory LRU cache. Hermes uses three tiers (L1 in-process,
 * L2 on-disk warm cache, L3 embeddings index). M1 ships L1 only — plumbing
 * is typed so M2 can add L2/L3 without breaking callers.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly capacity: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  invalidate(key?: K): void {
    if (key === undefined) {
      this.map.clear();
    } else {
      this.map.delete(key);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
