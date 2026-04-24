import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describeSources, resolveSecretsStore } from "../commands/secrets.js";

async function mktmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("describeSources", () => {
  it("names keychain+file when keychain is primary and file is fallback", () => {
    expect(describeSources("keychain", "encrypted_file")).toMatch(/system keychain/);
    expect(describeSources("keychain", "encrypted_file")).toMatch(/fallback/);
  });

  it("names file-only when keychain is unavailable", () => {
    expect(describeSources("encrypted_file", null)).toBe("encrypted file store");
  });
});

describe("resolveSecretsStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mktmp("petagent-cli-secrets-");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("with --no-keychain returns the encrypted-file store alone", async () => {
    const resolution = await resolveSecretsStore({
      noKeychain: true,
      keyFile: path.join(dir, "k"),
      storeFile: path.join(dir, "s.json"),
    });
    expect(resolution.primaryKind).toBe("encrypted_file");
    expect(resolution.fallbackKind).toBeNull();
  });

  it("end-to-end through the resolved store: set → get → delete", async () => {
    const resolution = await resolveSecretsStore({
      noKeychain: true,
      keyFile: path.join(dir, "k"),
      storeFile: path.join(dir, "s.json"),
    });
    await resolution.store.set("ANTHROPIC_API_KEY", "sk-ant-abc");
    expect(await resolution.store.get("ANTHROPIC_API_KEY")).toBe("sk-ant-abc");
    expect(await resolution.store.delete("ANTHROPIC_API_KEY")).toBe(true);
    expect(await resolution.store.get("ANTHROPIC_API_KEY")).toBeNull();
  });

  it("writes only to the store file (no plaintext leak) via --no-keychain", async () => {
    const storeFile = path.join(dir, "s.json");
    const resolution = await resolveSecretsStore({
      noKeychain: true,
      keyFile: path.join(dir, "k"),
      storeFile,
    });
    await resolution.store.set("TOKEN", "plaintext-never-disk");
    const raw = await fs.readFile(storeFile, "utf8");
    expect(raw).not.toMatch(/plaintext-never-disk/);
  });

  it("uses custom data-dir when --key-file / --store-file are omitted", async () => {
    const resolution = await resolveSecretsStore({
      noKeychain: true,
      dataDir: dir,
    });
    await resolution.store.set("X", "v");
    const keyStat = await fs.stat(path.join(dir, "secrets", "master.key"));
    const storeStat = await fs.stat(path.join(dir, "secrets", "store.json"));
    expect(keyStat.isFile()).toBe(true);
    expect(storeStat.isFile()).toBe(true);
  });
});
