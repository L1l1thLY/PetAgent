import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HookBus } from "@petagent/hooks";
import { createReflector } from "../composition/reflector.js";
import type { Config } from "../config.js";
import type { Db } from "@petagent/db";

const fakeDb = {} as unknown as Db;

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "petagent-reflector-factory-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("createReflector", () => {
  it("returns null when disabled", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: {
        reflectorEnabled: false,
        notesGitStoreDir: tmpRoot,
      } as Config,
    });
    expect(out).toBeNull();
  });

  it("returns a startable instance when enabled", async () => {
    const out = await createReflector({
      db: fakeDb,
      hookBus: new HookBus(),
      config: {
        reflectorEnabled: true,
        notesGitStoreDir: tmpRoot,
      } as Config,
    });
    expect(out).not.toBeNull();
    expect(typeof out!.start).toBe("function");
    expect(typeof out!.stop).toBe("function");
  });
});
