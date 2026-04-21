import { describe, it, expect } from "vitest";
import {
  DEFAULT_WORKER_NAMES,
  DEFAULT_ROLE_NAME,
  pickWorkerName,
  generateDefaultName,
} from "./default_worker_names.js";

describe("DEFAULT_ROLE_NAME", () => {
  it("covers every PluginRole", () => {
    for (const role of [
      "coordinator",
      "worker/explorer",
      "worker/planner",
      "worker/executor",
      "worker/reviewer",
      "psychologist",
    ] as const) {
      expect(DEFAULT_ROLE_NAME[role]).toBeTruthy();
    }
  });
});

describe("pickWorkerName", () => {
  it("wraps around when index exceeds the name list length", () => {
    expect(pickWorkerName(0)).toBe(DEFAULT_WORKER_NAMES[0]);
    expect(pickWorkerName(DEFAULT_WORKER_NAMES.length)).toBe(DEFAULT_WORKER_NAMES[0]);
  });
});

describe("generateDefaultName", () => {
  it("returns the role default when no existing name collides", () => {
    expect(generateDefaultName([], "worker/executor")).toBe("Corvus");
    expect(generateDefaultName([], "coordinator")).toBe("Chief");
    expect(generateDefaultName([], "psychologist")).toBe("Echo");
  });

  it("skips to the next unused pronounceable name when the role default is taken", () => {
    const existing = ["Corvus"];
    const name = generateDefaultName(existing, "worker/executor");
    expect(existing).not.toContain(name);
    expect(DEFAULT_WORKER_NAMES).toContain(name);
  });

  it("never returns a name that collides with the existing set, case-insensitively", () => {
    const existing = ["corvus", "ATLAS", "Beacon"];
    const name = generateDefaultName(existing, "worker/executor");
    const lower = name.toLowerCase();
    for (const taken of existing) {
      expect(lower).not.toBe(taken.toLowerCase());
    }
  });

  it("falls back to suffixing when every pronounceable name plus role default is taken", () => {
    const existing = [DEFAULT_ROLE_NAME["worker/executor"], ...DEFAULT_WORKER_NAMES];
    const name = generateDefaultName(existing, "worker/executor");
    expect(name).toMatch(/^Worker-\d+$/);
    expect(existing).not.toContain(name);
  });

  it("increments the numeric suffix past any existing Worker-N in the pool", () => {
    const existing = [
      DEFAULT_ROLE_NAME["worker/executor"],
      ...DEFAULT_WORKER_NAMES,
      "Worker-1",
      "Worker-2",
      "Worker-7",
    ];
    expect(generateDefaultName(existing, "worker/executor")).toBe("Worker-3");
  });

  it("picks role-default first even if earlier pronounceable names are free", () => {
    // With no conflicts, Corvus (the worker/executor default) is returned,
    // not Atlas (which comes first alphabetically but is the explorer default).
    expect(generateDefaultName([], "worker/executor")).toBe("Corvus");
    expect(generateDefaultName([], "worker/explorer")).toBe("Atlas");
  });
});
