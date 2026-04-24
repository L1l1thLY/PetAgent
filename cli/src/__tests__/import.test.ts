import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseTemplateSpec,
  readTemplatePlan,
  resolveReportsToMap,
  type PlannedHire,
} from "../commands/import.js";

async function mktmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function makeTemplateFixture(opts: {
  slug: string;
  companyName: string;
  agents: Array<{
    slug: string;
    name: string;
    title?: string;
    reportsTo?: string;
    roleType: string;
    adapterType?: string;
    monthlyUsd?: number;
  }>;
}): Promise<string> {
  const dir = await mktmp(`petagent-import-${opts.slug}-`);
  await fs.writeFile(
    path.join(dir, "COMPANY.md"),
    `---
schema: agentcompanies/v1
kind: company
slug: ${opts.slug}
name: ${opts.companyName}
description: fixture
---
body`,
  );
  for (const agent of opts.agents) {
    const agentDir = path.join(dir, "agents", agent.slug);
    await fs.mkdir(agentDir, { recursive: true });
    const rt = agent.reportsTo ?? "null";
    const titleLine = agent.title ? `title: ${agent.title}\n` : "";
    await fs.writeFile(
      path.join(agentDir, "AGENTS.md"),
      `---
schema: agentcompanies/v1
kind: agent
slug: ${agent.slug}
name: ${agent.name}
${titleLine}reportsTo: ${rt}
---
body`,
    );
  }
  const petagentYaml = [
    "schema: petagent/v1",
    "agents:",
    ...opts.agents.flatMap((agent) => [
      `  ${agent.slug}:`,
      "    adapter:",
      `      type: ${agent.adapterType ?? "petagent"}`,
      "      config:",
      `        roleType: ${agent.roleType}`,
      "    budget:",
      `      monthlyUsd: ${agent.monthlyUsd ?? 0}`,
    ]),
  ].join("\n");
  await fs.writeFile(path.join(dir, ".petagent.yaml"), petagentYaml);
  return dir;
}

describe("parseTemplateSpec", () => {
  it("recognizes the built-in @petagent/templates/* prefix", () => {
    const source = parseTemplateSpec("@petagent/templates/solo-pack");
    expect(source.kind).toBe("builtin");
    if (source.kind === "builtin") {
      expect(source.name).toBe("solo-pack");
      expect(path.basename(source.root)).toBe("solo-pack");
    }
  });

  it("rejects unknown built-in template names", () => {
    expect(() => parseTemplateSpec("@petagent/templates/does-not-exist")).toThrow(
      /unknown built-in template/,
    );
  });

  it("treats github:owner/repo/path as a stub", () => {
    const source = parseTemplateSpec("github:acme/company/team.yaml");
    expect(source.kind).toBe("github");
  });

  it("treats http(s) URLs as stub github-mode too", () => {
    const source = parseTemplateSpec("https://example.com/company.yaml");
    expect(source.kind).toBe("github");
  });

  it("treats anything else as a local directory (resolved to absolute path)", () => {
    const source = parseTemplateSpec("./my-team");
    expect(source.kind).toBe("local_dir");
    if (source.kind === "local_dir") {
      expect(path.isAbsolute(source.root)).toBe(true);
    }
  });

  it("rejects empty/whitespace-only spec", () => {
    expect(() => parseTemplateSpec("")).toThrow(/must not be empty/);
    expect(() => parseTemplateSpec("   ")).toThrow(/must not be empty/);
  });
});

describe("readTemplatePlan", () => {
  let fixture: string;

  afterEach(async () => {
    if (fixture) {
      await fs.rm(fixture, { recursive: true, force: true });
    }
  });

  it("reads COMPANY.md + each AGENTS.md + .petagent.yaml and produces a hire plan", async () => {
    fixture = await makeTemplateFixture({
      slug: "fx1",
      companyName: "Fixture One",
      agents: [
        {
          slug: "coordinator-1",
          name: "Coordinator-1",
          title: "Coordinator",
          roleType: "coordinator",
          monthlyUsd: 10,
        },
        {
          slug: "executor-1",
          name: "Executor-1",
          reportsTo: "coordinator-1",
          roleType: "worker/executor",
          monthlyUsd: 30,
        },
      ],
    });
    const plan = await readTemplatePlan({ kind: "local_dir", root: fixture });
    expect(plan.companyName).toBe("Fixture One");
    expect(plan.companySlug).toBe("fx1");
    expect(plan.hires).toHaveLength(2);
    expect(plan.hires[0].name).toBe("Coordinator-1");
    expect(plan.hires[0].body.adapterType).toBe("petagent");
    expect((plan.hires[0].body.adapterConfig as { roleType: string }).roleType).toBe("coordinator");
    expect(plan.hires[0].body.budgetMonthlyCents).toBe(1000);
    expect(plan.hires[1].reportsTo).toBe("coordinator-1");
  });

  it("carries claude_local adapter through from .petagent.yaml", async () => {
    fixture = await makeTemplateFixture({
      slug: "fx-claude",
      companyName: "Claude Mix",
      agents: [
        {
          slug: "exec-1",
          name: "Exec-1",
          adapterType: "claude_local",
          roleType: "worker/executor",
          monthlyUsd: 50,
        },
      ],
    });
    const plan = await readTemplatePlan({ kind: "local_dir", root: fixture });
    expect(plan.hires[0].body.adapterType).toBe("claude_local");
  });

  it("throws when COMPANY.md is missing", async () => {
    fixture = await mktmp("petagent-import-bad-");
    await expect(
      readTemplatePlan({ kind: "local_dir", root: fixture }),
    ).rejects.toThrow(/missing COMPANY\.md/);
  });

  it("throws when .petagent.yaml lacks a roleType for a declared agent", async () => {
    fixture = await mktmp("petagent-import-noroletype-");
    await fs.writeFile(
      path.join(fixture, "COMPANY.md"),
      "---\nschema: agentcompanies/v1\nkind: company\nslug: x\nname: X\ndescription: d\n---\nbody",
    );
    await fs.mkdir(path.join(fixture, "agents", "a"), { recursive: true });
    await fs.writeFile(
      path.join(fixture, "agents", "a", "AGENTS.md"),
      "---\nschema: agentcompanies/v1\nkind: agent\nslug: a\nname: A\nreportsTo: null\n---\nbody",
    );
    // no .petagent.yaml at all → no roleType available
    await expect(
      readTemplatePlan({ kind: "local_dir", root: fixture }),
    ).rejects.toThrow(/roleType/);
  });

  it("github source throws a stub message", async () => {
    await expect(
      readTemplatePlan({ kind: "github", url: "github:x/y/z" }),
    ).rejects.toThrow(/V1 stub/);
  });

  it("reads the built-in solo-pack correctly", async () => {
    const spec = parseTemplateSpec("@petagent/templates/solo-pack");
    const plan = await readTemplatePlan(spec);
    expect(plan.companySlug).toBe("solo-pack");
    expect(plan.hires).toHaveLength(3);
    const roleTypes = plan.hires
      .map((h) => (h.body.adapterConfig as { roleType: string }).roleType)
      .sort();
    expect(roleTypes).toEqual(["coordinator", "psychologist", "worker/executor"]);
  });
});

describe("resolveReportsToMap", () => {
  it("maps slug reportsTo to newly-created agent IDs", () => {
    const hires: PlannedHire[] = [
      { name: "Coord-1", title: "", reportsTo: null, body: {} },
      { name: "Exec-1", title: "", reportsTo: "coordinator-1", body: {} },
    ];
    const created = [
      { slug: "coordinator-1", id: "uuid-1" },
      { slug: "executor-1", id: "uuid-2" },
    ];
    const out = resolveReportsToMap(hires, created);
    expect(out[0]).toEqual({ slug: "coordinator-1", reportsToId: null });
    expect(out[1]).toEqual({ slug: "executor-1", reportsToId: "uuid-1" });
  });

  it("reports null when the referenced slug was not created", () => {
    const hires: PlannedHire[] = [
      { name: "X", title: "", reportsTo: "orphan", body: {} },
    ];
    const created = [{ slug: "real", id: "u1" }];
    const out = resolveReportsToMap(hires, created);
    expect(out[0].reportsToId).toBeNull();
  });
});
