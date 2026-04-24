/**
 * Composite store that prefers a primary backend (system keychain) and
 * falls back to a secondary (encrypted file) when the primary throws
 * or returns null. Writes go to the primary only — the fallback is
 * strictly read-side compatibility for hosts that previously wrote to
 * it and later gained a keychain.
 */

import { assertValidSecretName, type SecretsStore, type SecretsStoreKind } from "./types.js";

export interface PreferredStoreOptions {
  /** When primary throws on a read, silently fall back to secondary. Default true. */
  fallbackOnReadError?: boolean;
}

export class PreferredSecretsStore implements SecretsStore {
  readonly kind: SecretsStoreKind;
  private readonly fallbackOnReadError: boolean;

  constructor(
    private readonly primary: SecretsStore,
    private readonly secondary: SecretsStore,
    opts: PreferredStoreOptions = {},
  ) {
    this.kind = primary.kind;
    this.fallbackOnReadError = opts.fallbackOnReadError ?? true;
  }

  async get(name: string): Promise<string | null> {
    assertValidSecretName(name);
    try {
      const fromPrimary = await this.primary.get(name);
      if (fromPrimary !== null) return fromPrimary;
    } catch (err) {
      if (!this.fallbackOnReadError) throw err;
    }
    return this.secondary.get(name);
  }

  async set(name: string, value: string): Promise<void> {
    assertValidSecretName(name);
    await this.primary.set(name, value);
  }

  async delete(name: string): Promise<boolean> {
    assertValidSecretName(name);
    const primaryRemoved = await safeDelete(this.primary, name);
    const secondaryRemoved = await safeDelete(this.secondary, name);
    return primaryRemoved || secondaryRemoved;
  }

  async listNames(): Promise<string[]> {
    const set = new Set<string>();
    try {
      for (const n of await this.primary.listNames()) set.add(n);
    } catch {
      // primary unavailable — still show secondary names
    }
    try {
      for (const n of await this.secondary.listNames()) set.add(n);
    } catch {
      // ignore
    }
    return Array.from(set).sort();
  }
}

async function safeDelete(store: SecretsStore, name: string): Promise<boolean> {
  try {
    return await store.delete(name);
  } catch {
    return false;
  }
}
