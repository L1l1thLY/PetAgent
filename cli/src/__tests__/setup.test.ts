import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  buildSetupPlan,
  ensureSandboxDir,
  suggestCompanyName,
  renderSetupPreview,
} from "../commands/setup.js";

async function mktmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("suggestCompanyName", () => {
  it("returns a non-empty slug-ish name derived from hostname", () => {
    const name = suggestCompanyName();
    expect(name.length).toBeGreaterThan(0);
    expect(name).toMatch(/-petagent$/);
  });
});

describe("buildSetupPlan", () => {
  it("defaults the company name from hostname when none is supplied", () => {
    const plan = buildSetupPlan({});
    expect(plan.companyName.length).toBeGreaterThan(0);
    expect(plan.companyName).toMatch(/-petagent$/);
  });

  it("uses the provided company name verbatim when non-empty", () => {
    const plan = buildSetupPlan({ companyName: "Acme-Dev" });
    expect(plan.companyName).toBe("Acme-Dev");
  });

  it("falls back to default when companyName is blank/whitespace", () => {
    const plan = buildSetupPlan({ companyName: "   " });
    expect(plan.companyName).not.toBe("   ");
  });

  it("recognizes valid template names case-insensitively", () => {
    expect(buildSetupPlan({ template: "small-dev-team" }).template).toBe("small-dev-team");
    expect(buildSetupPlan({ template: "SOLO-PACK" }).template).toBe("solo-pack");
    expect(buildSetupPlan({ template: "hybrid-team" }).template).toBe("hybrid-team");
  });

  it("defaults to solo-pack when template is unknown or omitted", () => {
    expect(buildSetupPlan({}).template).toBe("solo-pack");
    expect(buildSetupPlan({ template: "does-not-exist" }).template).toBe("solo-pack");
  });

  it("apiKeyProvided reflects the truthiness of a non-empty apiKey", () => {
    expect(buildSetupPlan({}).apiKeyProvided).toBe(false);
    expect(buildSetupPlan({ apiKey: "" }).apiKeyProvided).toBe(false);
    expect(buildSetupPlan({ apiKey: "   " }).apiKeyProvided).toBe(false);
    expect(buildSetupPlan({ apiKey: "sk-ant-abc" }).apiKeyProvided).toBe(true);
  });

  it("apiKeySecretName is always ANTHROPIC_API_KEY", () => {
    expect(buildSetupPlan({}).apiKeySecretName).toBe("ANTHROPIC_API_KEY");
    expect(buildSetupPlan({ apiKey: "x" }).apiKeySecretName).toBe("ANTHROPIC_API_KEY");
  });

  it("sandbox default is resolved to an absolute path under .petagent/sandbox", () => {
    const plan = buildSetupPlan({});
    expect(path.isAbsolute(plan.sandboxDir)).toBe(true);
    expect(plan.sandboxDir.endsWith(path.join(".petagent", "sandbox"))).toBe(true);
  });

  it("sandbox override is resolved to absolute and trimmed", () => {
    const plan = buildSetupPlan({ sandboxDir: "   ./custom  " });
    expect(path.isAbsolute(plan.sandboxDir)).toBe(true);
    expect(plan.sandboxDir.endsWith("custom")).toBe(true);
  });
});

describe("renderSetupPreview", () => {
  it("returns a human preview naming company + template + sandbox + api-key status", async () => {
    const plan = buildSetupPlan({
      companyName: "Acme",
      template: "solo-pack",
      apiKey: "sk-x",
      sandboxDir: "/tmp/acme-sandbox",
    });
    const preview = await renderSetupPreview(plan);
    expect(preview).toMatch(/PetAgent setup plan/);
    expect(preview).toMatch(/Company name:\s+Acme/);
    expect(preview).toMatch(/Starter template:\s+solo-pack/);
    expect(preview).toMatch(/Sandbox directory:\s+\/tmp\/acme-sandbox/);
    expect(preview).toMatch(/will be stored in secrets/);
  });

  it("marks api-key as (skip) when not provided", async () => {
    const plan = buildSetupPlan({ companyName: "Acme" });
    const preview = await renderSetupPreview(plan);
    expect(preview).toMatch(/not provided/);
  });
});

describe("ensureSandboxDir", () => {
  let root: string;
  beforeEach(async () => {
    root = await mktmp("petagent-setup-sbx-");
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("creates the directory when it does not exist", async () => {
    const target = path.join(root, "sandbox");
    await ensureSandboxDir(target);
    const stat = await fs.stat(target);
    expect(stat.isDirectory()).toBe(true);
  });

  it("is idempotent: calling twice does not throw", async () => {
    const target = path.join(root, "sandbox");
    await ensureSandboxDir(target);
    await expect(ensureSandboxDir(target)).resolves.toBeUndefined();
  });

  it("creates intermediate parents (recursive)", async () => {
    const target = path.join(root, "a", "b", "c");
    await ensureSandboxDir(target);
    const stat = await fs.stat(target);
    expect(stat.isDirectory()).toBe(true);
  });
});
