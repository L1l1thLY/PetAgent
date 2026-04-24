/**
 * System keychain store (keytar-backed). keytar is a native module and
 * can fail to install on some sandboxes, so it's declared as an
 * optional peerDependency and we import it dynamically.
 *
 * When keytar is unavailable, `tryCreateKeychainStore` returns null so
 * callers can fall back to `EncryptedFileSecretsStore`.
 */

import { assertValidSecretName, type SecretsStore } from "./types.js";

export interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

export interface KeychainSecretsStoreOptions {
  /** Service name under which PetAgent stores its secrets. */
  serviceName?: string;
}

const DEFAULT_SERVICE_NAME = "petagent";

export class KeychainSecretsStore implements SecretsStore {
  readonly kind = "keychain" as const;
  private readonly serviceName: string;

  constructor(
    private readonly keytar: KeytarModule,
    opts: KeychainSecretsStoreOptions = {},
  ) {
    this.serviceName = opts.serviceName ?? DEFAULT_SERVICE_NAME;
  }

  async get(name: string): Promise<string | null> {
    assertValidSecretName(name);
    return this.keytar.getPassword(this.serviceName, name);
  }

  async set(name: string, value: string): Promise<void> {
    assertValidSecretName(name);
    if (typeof value !== "string") throw new Error("secret value must be a string");
    await this.keytar.setPassword(this.serviceName, name, value);
  }

  async delete(name: string): Promise<boolean> {
    assertValidSecretName(name);
    return this.keytar.deletePassword(this.serviceName, name);
  }

  async listNames(): Promise<string[]> {
    const entries = await this.keytar.findCredentials(this.serviceName);
    return entries.map((e) => e.account).sort();
  }
}

/**
 * Dynamically load keytar and return a `KeychainSecretsStore`. Returns
 * `null` if the module cannot be loaded (not installed, native build
 * failed, etc.). Callers should fall back to the encrypted file store.
 */
export async function tryCreateKeychainStore(
  opts: KeychainSecretsStoreOptions = {},
): Promise<KeychainSecretsStore | null> {
  try {
    const mod = (await import("keytar")) as unknown as {
      default?: KeytarModule;
    } & KeytarModule;
    const keytar = mod.default ?? mod;
    if (typeof keytar.getPassword !== "function") return null;
    return new KeychainSecretsStore(keytar, opts);
  } catch {
    return null;
  }
}
