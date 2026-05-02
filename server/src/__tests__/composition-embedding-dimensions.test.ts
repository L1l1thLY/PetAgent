import { describe, expect, it, vi } from "vitest";
import type { Db } from "@petagent/db";
import {
  parsePgVectorType,
  validateAgentNotesEmbeddingDimensions,
} from "../composition/embedding-dimensions.js";

function fakeDb(dataType: string | null): Db {
  return {
    execute: vi.fn(async () => ({ rows: dataType === null ? [] : [{ dataType }] })),
  } as unknown as Db;
}

describe("parsePgVectorType", () => {
  it("extracts vector dimensions", () => {
    expect(parsePgVectorType("vector(1536)")).toBe(1536);
    expect(parsePgVectorType(" VECTOR(1024) ")).toBe(1024);
  });

  it("returns null for non-vector values", () => {
    expect(parsePgVectorType("text")).toBeNull();
    expect(parsePgVectorType(null)).toBeNull();
  });
});

describe("validateAgentNotesEmbeddingDimensions", () => {
  it("does not warn when configured and provider dimensions match the DB", async () => {
    const warn = vi.fn();
    await validateAgentNotesEmbeddingDimensions({
      db: fakeDb("vector(1024)"),
      configuredDims: 1024,
      providerDims: 1024,
      providerLabel: "kimi-coding/kimi-k2.6",
      logger: { warn },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when PETAGENT_EMBEDDING_DIMS differs from the DB", async () => {
    const warn = vi.fn();
    await validateAgentNotesEmbeddingDimensions({
      db: fakeDb("vector(1536)"),
      configuredDims: 1024,
      providerDims: null,
      logger: { warn },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("PETAGENT_EMBEDDING_DIMS"));
  });

  it("warns when provider dimensions differ from the DB", async () => {
    const warn = vi.fn();
    await validateAgentNotesEmbeddingDimensions({
      db: fakeDb("vector(1536)"),
      configuredDims: 1536,
      providerDims: 1024,
      providerLabel: "kimi-coding/kimi-k2.6",
      logger: { warn },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("kimi-coding/kimi-k2.6"));
  });

  it("warns instead of throwing when the probe fails", async () => {
    const warn = vi.fn();
    const db = {
      execute: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    } as unknown as Db;
    await validateAgentNotesEmbeddingDimensions({
      db,
      configuredDims: 1536,
      providerDims: null,
      logger: { warn },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("database unavailable"));
  });
});
