import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GitStore } from "@petagent/safety-net";
import { startGitSyncRoutine } from "../skill-miner/git-sync-routine.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "petagent-git-sync-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("startGitSyncRoutine: pushNow against an unreachable remote", () => {
  it("returns ok=false with error rather than throwing", async () => {
    const r = startGitSyncRoutine({
      storeDir: tmp,
      remoteUrl: "https://invalid.example.test/petagent.git",
      intervalMs: 1_000_000,
    });
    const result = await r.pushNow();
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.remote).toBe("origin");
    expect(result.ref).toBe("main");
    r.stop();
  });

  it("returns ok=false when ref does not exist (empty repo)", async () => {
    const r = startGitSyncRoutine({
      storeDir: tmp,
      remoteUrl: "https://invalid.example.test/repo.git",
      intervalMs: 1_000_000,
    });
    const result = await r.pushNow();
    expect(result.ok).toBe(false);
    // The error is either "ref not found locally" (empty repo) or a
    // network error — both are acceptable graceful failures.
    expect(result.error).toBeTruthy();
    r.stop();
  });
});

describe("startGitSyncRoutine: setRemote round-trip", () => {
  it("sets the remote on first init and persists it", async () => {
    const r = startGitSyncRoutine({
      storeDir: tmp,
      remoteUrl: "https://example.com/repo.git",
      remoteName: "myorigin",
      intervalMs: 1_000_000,
    });
    await r.pushNow();
    r.stop();

    // Re-open the store and confirm remote is set
    const store = new GitStore({ rootDir: tmp });
    await store.init();
    const url = await store.getRemote("myorigin");
    expect(url).toBe("https://example.com/repo.git");
  });

  it("lastResult() returns the most recent push attempt", async () => {
    const r = startGitSyncRoutine({
      storeDir: tmp,
      remoteUrl: "https://invalid.example.test/repo.git",
      intervalMs: 1_000_000,
    });
    expect(r.lastResult()).toBeNull();
    const out = await r.pushNow();
    expect(r.lastResult()).toBe(out);
    r.stop();
  });
});

describe("GitStore: setRemote / getRemote", () => {
  it("returns null when remote not configured", async () => {
    const store = new GitStore({ rootDir: tmp });
    await store.init();
    expect(await store.getRemote("origin")).toBeNull();
  });

  it("setRemote is idempotent on identical URL", async () => {
    const store = new GitStore({ rootDir: tmp });
    await store.init();
    await store.setRemote("origin", "https://example.com/x.git");
    await store.setRemote("origin", "https://example.com/x.git");
    expect(await store.getRemote("origin")).toBe("https://example.com/x.git");
  });

  it("setRemote overwrites when URL differs", async () => {
    const store = new GitStore({ rootDir: tmp });
    await store.init();
    await store.setRemote("origin", "https://old.example/x.git");
    await store.setRemote("origin", "https://new.example/x.git");
    expect(await store.getRemote("origin")).toBe("https://new.example/x.git");
  });
});
