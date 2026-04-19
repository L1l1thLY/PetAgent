import { describe, it, expect } from "vitest";
import { LruCache } from "./indexer.js";

describe("LruCache", () => {
  it("stores and retrieves values", () => {
    const c = new LruCache<string, number>(3);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
  });

  it("evicts least-recently-used when over capacity", () => {
    const c = new LruCache<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  it("promotes on get", () => {
    const c = new LruCache<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
  });

  it("invalidates one or all", () => {
    const c = new LruCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    c.invalidate("a");
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    c.invalidate();
    expect(c.size).toBe(0);
  });
});
