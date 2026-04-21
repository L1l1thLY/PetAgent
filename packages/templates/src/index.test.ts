import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  TEMPLATE_NAMES,
  PACKAGE_ROOT,
  resolveTemplateRoot,
  describeTemplate,
  listTemplates,
  parseFrontmatter,
  listAgentDirs,
  type TemplateName,
} from "./index.js";

const EXPECTED_AGENT_COUNTS: Record<TemplateName, number> = {
  "solo-pack": 3,
  "small-dev-team": 8,
  "hybrid-team": 6,
};

describe("@petagent/templates package wiring", () => {
  it("PACKAGE_ROOT points at the package directory containing the templates", async () => {
    const stat = await fs.stat(PACKAGE_ROOT);
    expect(stat.isDirectory()).toBe(true);
    for (const name of TEMPLATE_NAMES) {
      const sub = await fs.stat(path.join(PACKAGE_ROOT, name));
      expect(sub.isDirectory(), name).toBe(true);
    }
  });

  it("listTemplates returns one descriptor per declared name", async () => {
    const all = await listTemplates();
    expect(all.map((d) => d.name).sort()).toEqual([...TEMPLATE_NAMES].sort());
  });
});

describe("parseFrontmatter", () => {
  it("returns the parsed frontmatter object", () => {
    const md = "---\nname: X\nslug: x\n---\nbody";
    expect(parseFrontmatter(md)).toEqual({ name: "X", slug: "x" });
  });

  it("returns {} when there is no frontmatter", () => {
    expect(parseFrontmatter("# just a body")).toEqual({});
  });
});

describe.each(TEMPLATE_NAMES)("template: %s", (name) => {
  const root = resolveTemplateRoot(name);

  it("has a COMPANY.md at the package root", async () => {
    const stat = await fs.stat(path.join(root, "COMPANY.md"));
    expect(stat.isFile()).toBe(true);
  });

  it("COMPANY.md frontmatter is agentcompanies/v1 with required fields", async () => {
    const text = await fs.readFile(path.join(root, "COMPANY.md"), "utf8");
    const fm = parseFrontmatter(text);
    expect(fm.schema).toBe("agentcompanies/v1");
    expect(fm.kind).toBe("company");
    expect(typeof fm.name).toBe("string");
    expect(typeof fm.description).toBe("string");
    expect(typeof fm.slug).toBe("string");
    expect(fm.slug).toBe(name);
  });

  it("agent count matches the expected roster size", async () => {
    const dirs = await listAgentDirs(root);
    expect(dirs.length).toBe(EXPECTED_AGENT_COUNTS[name]);
  });

  it("every agent directory has an AGENTS.md with valid frontmatter", async () => {
    const dirs = await listAgentDirs(root);
    for (const slug of dirs) {
      const agentsMdPath = path.join(root, "agents", slug, "AGENTS.md");
      const text = await fs.readFile(agentsMdPath, "utf8");
      const fm = parseFrontmatter(text);
      expect(fm.schema, `${slug} schema`).toBe("agentcompanies/v1");
      expect(fm.kind, `${slug} kind`).toBe("agent");
      expect(typeof fm.name, `${slug} name`).toBe("string");
      expect(fm.slug, `${slug} slug`).toBe(slug);
    }
  });

  it("ships a .petagent.yaml sidecar with one entry per agent", async () => {
    const yamlText = await fs.readFile(path.join(root, ".petagent.yaml"), "utf8");
    const data = yaml.load(yamlText) as Record<string, unknown>;
    expect(data.schema).toBe("petagent/v1");
    const agents = data.agents as Record<string, { adapter?: { type?: string } }>;
    const agentDirs = await listAgentDirs(root);
    expect(Object.keys(agents).sort()).toEqual([...agentDirs].sort());
    for (const slug of agentDirs) {
      expect(agents[slug].adapter?.type, `${slug} adapter.type`).toBeTruthy();
    }
  });

  it("describeTemplate populates name/description/slug/agentCount", async () => {
    const desc = await describeTemplate(name);
    expect(desc.name).toBe(name);
    expect(desc.slug).toBe(name);
    expect(desc.companyName.length).toBeGreaterThan(0);
    expect(desc.description.length).toBeGreaterThan(0);
    expect(desc.agentCount).toBe(EXPECTED_AGENT_COUNTS[name]);
  });
});

describe("hybrid-team specifics", () => {
  it("uses claude_local adapter for the two ClaudeCode executors", async () => {
    const yamlText = await fs.readFile(
      path.join(resolveTemplateRoot("hybrid-team"), ".petagent.yaml"),
      "utf8",
    );
    const data = yaml.load(yamlText) as { agents: Record<string, { adapter?: { type?: string; config?: Record<string, unknown> } }> };
    const exec1 = data.agents["claudecode-executor-1"];
    const exec2 = data.agents["claudecode-executor-2"];
    expect(exec1.adapter?.type).toBe("claude_local");
    expect(exec2.adapter?.type).toBe("claude_local");
    expect(exec1.adapter?.config?.selfReviewsImplementation).toBe(true);
    expect(exec2.adapter?.config?.selfReviewsImplementation).toBe(true);
  });

  it("petagent-side agents (coord/planner/reviewer/therapist) all use the petagent adapter", async () => {
    const yamlText = await fs.readFile(
      path.join(resolveTemplateRoot("hybrid-team"), ".petagent.yaml"),
      "utf8",
    );
    const data = yaml.load(yamlText) as { agents: Record<string, { adapter?: { type?: string } }> };
    for (const slug of ["coordinator-1", "planner-1", "reviewer-1", "therapist"]) {
      expect(data.agents[slug].adapter?.type, slug).toBe("petagent");
    }
  });
});

describe("small-dev-team specifics", () => {
  it("ships an engineering team package whose manager points at coordinator-2", async () => {
    const teamMdPath = path.join(
      resolveTemplateRoot("small-dev-team"),
      "teams",
      "engineering",
      "TEAM.md",
    );
    const text = await fs.readFile(teamMdPath, "utf8");
    const fm = parseFrontmatter(text);
    expect(fm.schema).toBe("agentcompanies/v1");
    expect(fm.kind).toBe("team");
    expect(typeof fm.manager).toBe("string");
    expect(String(fm.manager)).toContain("coordinator-2");
  });
});
