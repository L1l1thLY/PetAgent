import { describe, it, expect, vi } from "vitest";
import { EmbeddingService } from "../embedding.js";
import type { EmbeddingTransport } from "../embedding_transport.js";

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

describe("EmbeddingService with transport", () => {
  it("delegates embedBatch to the transport when useStub is false", async () => {
    const transport: EmbeddingTransport = {
      embed: vi.fn(async (texts: string[]) =>
        texts.map(() => new Array<number>(1536).fill(0)),
      ),
    };
    const svc = new EmbeddingService({ apiKey: "sk-test", useStub: false, transport });
    const out = await svc.embedBatch(["a", "b"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(1536);
    expect(transport.embed).toHaveBeenCalledWith(["a", "b"]);
  });

  it("uses stub when no transport and useStub is unspecified", async () => {
    const svc = new EmbeddingService();
    const out = await svc.embed("x");
    expect(out).toHaveLength(1536);
  });

  it("throws when useStub:false and no transport provided", async () => {
    const svc = new EmbeddingService({ apiKey: "sk-test", useStub: false });
    await expect(svc.embedBatch(["x"])).rejects.toThrow(/transport/i);
  });
});
