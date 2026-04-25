import { describe, it, expect } from "vitest";
import { EmbeddingService } from "../embedding.js";

describe("EmbeddingService (stub mode)", () => {
  it("returns a 1536-dim unit vector for any input", async () => {
    const svc = new EmbeddingService();
    const vec = await svc.embed("hello world");
    expect(vec).toHaveLength(1536);
    const magnitude = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    expect(magnitude).toBeCloseTo(1, 4);
  });

  it("is deterministic — same input produces the same vector", async () => {
    const svc = new EmbeddingService();
    const a = await svc.embed("deploy to vercel");
    const b = await svc.embed("deploy to vercel");
    expect(a).toEqual(b);
  });

  it("produces different vectors for different inputs", async () => {
    const svc = new EmbeddingService();
    const a = await svc.embed("vercel auth via --token");
    const b = await svc.embed("postgres requires SSL in prod");
    expect(a).not.toEqual(b);
  });

  it("embedBatch returns a vector per input in order", async () => {
    const svc = new EmbeddingService();
    const out = await svc.embedBatch(["a", "b", "c"]);
    expect(out).toHaveLength(3);
    expect(out[0]).toHaveLength(1536);
    const direct = await svc.embed("b");
    expect(out[1]).toEqual(direct);
  });

  it("constructor throws when useStub:false but no apiKey provided", () => {
    expect(() => new EmbeddingService({ useStub: false })).toThrow(/apiKey/);
  });
});
