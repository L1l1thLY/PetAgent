import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeLocalInstancePaths,
  expandHomePrefix,
  resolvePetAgentHomeDir,
  resolvePetAgentInstanceId,
} from "../config/home.js";

const ORIGINAL_ENV = { ...process.env };

describe("home path resolution", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to ~/.petagent and default instance", () => {
    delete process.env.PETAGENT_HOME;
    delete process.env.PETAGENT_INSTANCE_ID;

    const paths = describeLocalInstancePaths();
    expect(paths.homeDir).toBe(path.resolve(os.homedir(), ".petagent"));
    expect(paths.instanceId).toBe("default");
    expect(paths.configPath).toBe(path.resolve(os.homedir(), ".petagent", "instances", "default", "config.json"));
  });

  it("supports PETAGENT_HOME and explicit instance ids", () => {
    process.env.PETAGENT_HOME = "~/petagent-home";

    const home = resolvePetAgentHomeDir();
    expect(home).toBe(path.resolve(os.homedir(), "petagent-home"));
    expect(resolvePetAgentInstanceId("dev_1")).toBe("dev_1");
  });

  it("rejects invalid instance ids", () => {
    expect(() => resolvePetAgentInstanceId("bad/id")).toThrow(/Invalid instance id/);
  });

  it("expands ~ prefixes", () => {
    expect(expandHomePrefix("~")).toBe(os.homedir());
    expect(expandHomePrefix("~/x/y")).toBe(path.resolve(os.homedir(), "x/y"));
  });
});
