/**
 * Public surface for @petagent/secrets (spec §16.1).
 *
 * A SecretsStore stores short string values under a name, encrypted at
 * rest. The CLI, the server, and adapters should never touch the
 * underlying storage directly — they go through the store port so that
 * swapping keychain ↔ file ↔ a future cloud KMS is a dependency change,
 * not a rewrite.
 */

export interface SecretsStore {
  /** Return the secret value, or `null` if not present. */
  get(name: string): Promise<string | null>;
  /** Store/replace the secret value. */
  set(name: string, value: string): Promise<void>;
  /** Remove the secret. Returns true if something was removed. */
  delete(name: string): Promise<boolean>;
  /** Enumerate every stored secret's name. Values are NEVER returned. */
  listNames(): Promise<string[]>;
  /** Human-readable kind label for logs and status output. */
  readonly kind: SecretsStoreKind;
}

export type SecretsStoreKind = "keychain" | "encrypted_file" | "memory";

/** Validation helper shared across stores. */
export function assertValidSecretName(name: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("secret name must be a non-empty string");
  }
  if (name.length > 256) {
    throw new Error("secret name must be <= 256 chars");
  }
  if (!/^[A-Za-z0-9_.\-]+$/.test(name)) {
    throw new Error(
      `secret name contains illegal characters: ${JSON.stringify(name)}. Allowed: A-Z a-z 0-9 _ . -`,
    );
  }
}
