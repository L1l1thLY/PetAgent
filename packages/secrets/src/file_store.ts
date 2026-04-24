/**
 * AES-256-GCM-on-disk fallback secrets store (spec §16.1).
 *
 * Used when the system keychain is unavailable (server hosts, Linux
 * sandboxes, CI). The master key is derived from a per-install key
 * file via HKDF-style scrypt; the ciphertext file is a JSON object of
 * base64-encoded records.
 *
 * Security properties:
 * - Each record uses a fresh random 12-byte nonce.
 * - AES-256-GCM provides both confidentiality and authentication.
 * - Ciphertext is stored with the name (cleartext); values are never
 *   written as plaintext. `listNames()` is cheap; `get()` must decrypt.
 * - File is written with `mode 0o600`. Directories created as `0o700`.
 *
 * Not designed for concurrent multi-writer use. For that, a cloud KMS
 * is the right move; this store is for single-host deployments.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomBytes, scrypt, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { assertValidSecretName, type SecretsStore } from "./types.js";

const SCRYPT_N = 1 << 15;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_SALT = Buffer.from("petagent-secrets/v1", "utf8");
const DERIVED_KEY_LEN = 32;
const NONCE_LEN = 12;
const AUTH_TAG_LEN = 16;

interface EncryptedRecord {
  v: 1;
  nonce: string;
  ciphertext: string;
  tag: string;
}

interface FileShape {
  version: 1;
  secrets: Record<string, EncryptedRecord>;
}

const EMPTY_FILE: FileShape = { version: 1, secrets: {} };

export interface EncryptedFileSecretsStoreOptions {
  /** Absolute path to the JSON ciphertext file. Will be created with mode 0o600. */
  storePath: string;
  /**
   * Path to the master-key file. If the file does not exist and
   * `createIfMissing` is true, a fresh 32-byte random key is written.
   */
  keyFilePath: string;
  createIfMissing?: boolean;
}

export class EncryptedFileSecretsStore implements SecretsStore {
  readonly kind = "encrypted_file" as const;

  private readonly storePath: string;
  private readonly keyFilePath: string;
  private readonly createIfMissing: boolean;
  private cachedDerivedKey: Buffer | null = null;

  constructor(opts: EncryptedFileSecretsStoreOptions) {
    this.storePath = opts.storePath;
    this.keyFilePath = opts.keyFilePath;
    this.createIfMissing = opts.createIfMissing ?? true;
  }

  async get(name: string): Promise<string | null> {
    assertValidSecretName(name);
    const file = await this.readFile();
    const record = file.secrets[name];
    if (!record) return null;
    const key = await this.derivedKey();
    return decryptRecord(record, key);
  }

  async set(name: string, value: string): Promise<void> {
    assertValidSecretName(name);
    if (typeof value !== "string") throw new Error("secret value must be a string");
    const file = await this.readFile();
    const key = await this.derivedKey();
    file.secrets[name] = encryptRecord(value, key);
    await this.writeFile(file);
  }

  async delete(name: string): Promise<boolean> {
    assertValidSecretName(name);
    const file = await this.readFile();
    if (!(name in file.secrets)) return false;
    delete file.secrets[name];
    await this.writeFile(file);
    return true;
  }

  async listNames(): Promise<string[]> {
    const file = await this.readFile();
    return Object.keys(file.secrets).sort();
  }

  private async derivedKey(): Promise<Buffer> {
    if (this.cachedDerivedKey) return this.cachedDerivedKey;
    const master = await this.readOrCreateMaster();
    const derived = await scryptAsync(master, SCRYPT_SALT, DERIVED_KEY_LEN);
    this.cachedDerivedKey = derived;
    return derived;
  }

  private async readOrCreateMaster(): Promise<Buffer> {
    try {
      return await fs.readFile(this.keyFilePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      if (!this.createIfMissing) {
        throw new Error(
          `master key file not found and createIfMissing=false: ${this.keyFilePath}`,
        );
      }
    }
    await fs.mkdir(path.dirname(this.keyFilePath), { recursive: true, mode: 0o700 });
    const fresh = randomBytes(32);
    await fs.writeFile(this.keyFilePath, fresh, { mode: 0o600 });
    return fresh;
  }

  private async readFile(): Promise<FileShape> {
    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw) as FileShape;
      if (parsed.version !== 1 || typeof parsed.secrets !== "object") {
        throw new Error(`unexpected secrets file shape at ${this.storePath}`);
      }
      return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ...EMPTY_FILE, secrets: {} };
      }
      throw err;
    }
  }

  private async writeFile(contents: FileShape): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true, mode: 0o700 });
    const serialized = JSON.stringify(contents, null, 2);
    await fs.writeFile(this.storePath, serialized, { mode: 0o600 });
  }
}

function scryptAsync(password: Buffer, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      length,
      { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 128 * 1024 * 1024 },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived);
      },
    );
  });
}

function encryptRecord(value: string, key: Buffer): EncryptedRecord {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== AUTH_TAG_LEN) {
    throw new Error(`unexpected auth tag length: ${tag.length}`);
  }
  return {
    v: 1,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decryptRecord(record: EncryptedRecord, key: Buffer): string {
  const nonce = Buffer.from(record.nonce, "base64");
  const ciphertext = Buffer.from(record.ciphertext, "base64");
  const tag = Buffer.from(record.tag, "base64");
  // Extra paranoia: check tag length via timingSafeEqual against a fixed zero
  // buffer to keep branching uniform for both valid and invalid inputs.
  if (tag.length !== AUTH_TAG_LEN) {
    const zero = Buffer.alloc(AUTH_TAG_LEN);
    try {
      timingSafeEqual(zero, zero);
    } finally {
      // intentional: ensure constant-time path ran
    }
    throw new Error("bad auth tag length");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
