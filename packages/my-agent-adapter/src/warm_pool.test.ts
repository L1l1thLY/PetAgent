import { describe, it, expect, vi } from "vitest";
import {
  NoOpWarmPool,
  StaticWarmPool,
  type WarmPool,
  type WarmPoolEntry,
} from "./warm_pool.js";

describe("NoOpWarmPool", () => {
  it("acquire always returns null", async () => {
    const pool: WarmPool = new NoOpWarmPool();
    expect(await pool.acquire({ role: "executor", companyId: "co-1" })).toBeNull();
  });

  it("count is always zero", async () => {
    const pool = new NoOpWarmPool();
    expect(await pool.count("executor")).toBe(0);
  });

  it("release is a no-op", async () => {
    const pool = new NoOpWarmPool();
    await expect(
      pool.release({ id: "x", role: "executor", companyId: "co-1", warmedAt: new Date() }),
    ).resolves.toBeUndefined();
  });
});

describe("StaticWarmPool", () => {
  it("acquire returns the first matching entry and removes it from the pool", async () => {
    const entry: WarmPoolEntry = {
      id: "warm-1",
      role: "executor",
      companyId: "co-1",
      warmedAt: new Date(),
    };
    const pool = new StaticWarmPool([entry]);
    const acquired = await pool.acquire({ role: "executor", companyId: "co-1" });
    expect(acquired?.id).toBe("warm-1");
    expect(await pool.count("executor")).toBe(0);
  });

  it("acquire returns null when role + company combo doesn't match", async () => {
    const pool = new StaticWarmPool([
      { id: "warm-1", role: "executor", companyId: "co-1", warmedAt: new Date() },
    ]);
    expect(await pool.acquire({ role: "executor", companyId: "co-2" })).toBeNull();
    expect(await pool.acquire({ role: "planner", companyId: "co-1" })).toBeNull();
  });

  it("release adds the entry back to the pool", async () => {
    const pool = new StaticWarmPool([]);
    const entry: WarmPoolEntry = {
      id: "warm-2",
      role: "planner",
      companyId: "co-1",
      warmedAt: new Date(),
    };
    await pool.release(entry);
    expect(await pool.count("planner")).toBe(1);
    expect((await pool.acquire({ role: "planner", companyId: "co-1" }))?.id).toBe("warm-2");
  });

  it("count is bounded to the requested role only", async () => {
    const pool = new StaticWarmPool([
      { id: "a", role: "executor", companyId: "co-1", warmedAt: new Date() },
      { id: "b", role: "executor", companyId: "co-1", warmedAt: new Date() },
      { id: "c", role: "planner", companyId: "co-1", warmedAt: new Date() },
    ]);
    expect(await pool.count("executor")).toBe(2);
    expect(await pool.count("planner")).toBe(1);
  });
});
