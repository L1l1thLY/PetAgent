import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertValidSecretName, type SecretsStore } from "./types.js";
import { EncryptedFileSecretsStore } from "./file_store.js";
import { PreferredSecretsStore } from "./preferred_store.js";

async function mktmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("assertValidSecretName", () => {
  it("accepts alphanumerics, underscore, dot, hyphen", () => {
    expect(() => assertValidSecretName("ANTHROPIC_API_KEY")).not.toThrow();
    expect(() => assertValidSecretName("github.token")).not.toThrow();
    expect(() => assertValidSecretName("my-secret-1")).not.toThrow();
  });

  it("rejects empty, whitespace, slashes, and overly long names", () => {
    expect(() => assertValidSecretName("")).toThrow(/non-empty/);
    expect(() => assertValidSecretName(" with space")).toThrow(/illegal/);
    expect(() => assertValidSecretName("foo/bar")).toThrow(/illegal/);
    expect(() => assertValidSecretName("a".repeat(257))).toThrow(/256/);
  });
});

describe("EncryptedFileSecretsStore", () => {
  let dir: string;
  let storePath: string;
  let keyPath: string;

  beforeEach(async () => {
    dir = await mktmp("petagent-secrets-file-");
    storePath = path.join(dir, "store.json");
    keyPath = path.join(dir, "master.key");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("round-trips set → get", async () => {
    const store = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    await store.set("ANTHROPIC_API_KEY", "sk-ant-foo");
    expect(await store.get("ANTHROPIC_API_KEY")).toBe("sk-ant-foo");
  });

  it("get returns null when the secret is absent", async () => {
    const store = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    expect(await store.get("nope")).toBeNull();
  });

  it("stores ciphertext on disk (not the plaintext value)", async () => {
    const store = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    await store.set("API_KEY", "super-secret-plaintext-42");
    const raw = await fs.readFile(storePath, "utf8");
    expect(raw).not.toMatch(/super-secret-plaintext-42/);
    const parsed = JSON.parse(raw) as { version: number; secrets: Record<string, unknown> };
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.secrets)).toEqual(["API_KEY"]);
  });

  it("persists the key file with 0o600 permissions when creating it", async () => {
    const store = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    await store.set("A", "x");
    const stat = await fs.stat(keyPath);
    // mask to permission bits only; compare with 0o600
    expect((stat.mode & 0o777).toString(8)).toBe("600");
  });

  it("a different master key cannot decrypt secrets written with the first key", async () => {
    const storeA = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    await storeA.set("X", "hello");

    // rotate: delete the key file and re-init; existing ciphertext should fail
    await fs.unlink(keyPath);
    const storeB = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    await expect(storeB.get("X")).rejects.toThrow();
  });

  it("delete removes a secret and returns true; subsequent delete returns false", async () => {
    const store = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    await store.set("X", "v");
    expect(await store.delete("X")).toBe(true);
    expect(await store.delete("X")).toBe(false);
    expect(await store.get("X")).toBeNull();
  });

  it("listNames returns sorted names without leaking values", async () => {
    const store = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    await store.set("beta", "2");
    await store.set("alpha", "1");
    expect(await store.listNames()).toEqual(["alpha", "beta"]);
  });

  it("round-trips a secret containing arbitrary UTF-8", async () => {
    const store = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    const value = "π ≈ 3.14 — \u2603 — مرحبا — 😀";
    await store.set("utf", value);
    expect(await store.get("utf")).toBe(value);
  });

  it("kind reports 'encrypted_file'", () => {
    const store = new EncryptedFileSecretsStore({ storePath, keyFilePath: keyPath });
    expect(store.kind).toBe("encrypted_file");
  });
});

// ─── Preferred store composition ──────────────────────────────────────────────

class MemoryStore implements SecretsStore {
  readonly kind = "memory" as const;
  private readonly data = new Map<string, string>();
  async get(name: string): Promise<string | null> {
    return this.data.get(name) ?? null;
  }
  async set(name: string, value: string): Promise<void> {
    this.data.set(name, value);
  }
  async delete(name: string): Promise<boolean> {
    return this.data.delete(name);
  }
  async listNames(): Promise<string[]> {
    return Array.from(this.data.keys()).sort();
  }
}

describe("PreferredSecretsStore", () => {
  it("reads hit the primary first", async () => {
    const primary = new MemoryStore();
    const secondary = new MemoryStore();
    await primary.set("K", "primary-value");
    await secondary.set("K", "secondary-value");
    const preferred = new PreferredSecretsStore(primary, secondary);
    expect(await preferred.get("K")).toBe("primary-value");
  });

  it("reads fall back to secondary when primary has nothing", async () => {
    const primary = new MemoryStore();
    const secondary = new MemoryStore();
    await secondary.set("K", "secondary-value");
    const preferred = new PreferredSecretsStore(primary, secondary);
    expect(await preferred.get("K")).toBe("secondary-value");
  });

  it("writes go to primary only", async () => {
    const primary = new MemoryStore();
    const secondary = new MemoryStore();
    const preferred = new PreferredSecretsStore(primary, secondary);
    await preferred.set("K", "v");
    expect(await primary.get("K")).toBe("v");
    expect(await secondary.get("K")).toBeNull();
  });

  it("delete removes from both stores (returns true if either removed)", async () => {
    const primary = new MemoryStore();
    const secondary = new MemoryStore();
    await secondary.set("K", "legacy");
    const preferred = new PreferredSecretsStore(primary, secondary);
    expect(await preferred.delete("K")).toBe(true);
    expect(await secondary.get("K")).toBeNull();
  });

  it("delete on a non-existent name returns false", async () => {
    const preferred = new PreferredSecretsStore(new MemoryStore(), new MemoryStore());
    expect(await preferred.delete("not-there")).toBe(false);
  });

  it("listNames unions both stores and dedupes", async () => {
    const primary = new MemoryStore();
    const secondary = new MemoryStore();
    await primary.set("a", "1");
    await primary.set("b", "2");
    await secondary.set("b", "2-legacy");
    await secondary.set("c", "3");
    const preferred = new PreferredSecretsStore(primary, secondary);
    expect(await preferred.listNames()).toEqual(["a", "b", "c"]);
  });

  it("primary read error falls back to secondary silently by default", async () => {
    const failing: SecretsStore = {
      kind: "keychain",
      async get() {
        throw new Error("keychain not available");
      },
      async set() {
        /* ignore */
      },
      async delete() {
        return false;
      },
      async listNames() {
        throw new Error("nope");
      },
    };
    const secondary = new MemoryStore();
    await secondary.set("K", "from-secondary");
    const preferred = new PreferredSecretsStore(failing, secondary);
    expect(await preferred.get("K")).toBe("from-secondary");
    expect(await preferred.listNames()).toEqual(["K"]);
  });

  it("fallbackOnReadError=false re-throws from primary on read", async () => {
    const failing: SecretsStore = {
      kind: "keychain",
      async get() {
        throw new Error("keychain down");
      },
      async set() {
        /* ignore */
      },
      async delete() {
        return false;
      },
      async listNames() {
        return [];
      },
    };
    const preferred = new PreferredSecretsStore(failing, new MemoryStore(), {
      fallbackOnReadError: false,
    });
    await expect(preferred.get("K")).rejects.toThrow(/keychain down/);
  });

  it("inherits kind from primary for status reporting", () => {
    const preferred = new PreferredSecretsStore(new MemoryStore(), new MemoryStore());
    expect(preferred.kind).toBe("memory");
  });
});
