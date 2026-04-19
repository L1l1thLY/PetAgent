import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RoleTemplateLoader, parseRoleMarkdown } from "./loader.js";

async function mktmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("parseRoleMarkdown", () => {
  it("parses frontmatter + body", () => {
    const md = `---
roleType: coordinator
description: The CEO role
isolation: remote
---
You coordinate the team.`;
    const tpl = parseRoleMarkdown(md);
    expect(tpl?.roleType).toBe("coordinator");
    expect(tpl?.prompt).toBe("You coordinate the team.");
    expect(tpl?.isolation).toBe("remote");
  });

  it("returns null when no frontmatter", () => {
    expect(parseRoleMarkdown("# no frontmatter")).toBeNull();
  });

  it("throws when required field missing", () => {
    const md = `---
roleType: x
---
body only`;
    expect(() => parseRoleMarkdown(md)).toThrow(/description/);
  });
});

describe("RoleTemplateLoader priority", () => {
  let userDir: string;
  let projectDir: string;
  let builtInDir: string;

  beforeEach(async () => {
    userDir = await mktmp("petagent-role-user-");
    projectDir = await mktmp("petagent-role-project-");
    builtInDir = await mktmp("petagent-role-builtin-");
  });

  afterEach(async () => {
    for (const d of [userDir, projectDir, builtInDir]) {
      await fs.rm(d, { recursive: true, force: true });
    }
  });

  it("user overrides project overrides built-in", async () => {
    await fs.writeFile(
      path.join(builtInDir, "coord.md"),
      "---\nroleType: coordinator\ndescription: built-in version\n---\nbody b",
    );
    await fs.writeFile(
      path.join(projectDir, "coord.md"),
      "---\nroleType: coordinator\ndescription: project version\n---\nbody p",
    );
    await fs.writeFile(
      path.join(userDir, "coord.md"),
      "---\nroleType: coordinator\ndescription: user version\n---\nbody u",
    );

    const loader = new RoleTemplateLoader({
      userDir,
      projectDir,
      pluginDirs: [],
      builtInDir,
    });
    const all = await loader.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].template.description).toBe("user version");
    expect(all[0].source).toBe("user");
  });

  it("loads multiple distinct role types", async () => {
    await fs.writeFile(
      path.join(builtInDir, "coord.md"),
      "---\nroleType: coordinator\ndescription: c\n---\ncbody",
    );
    await fs.writeFile(
      path.join(builtInDir, "exec.md"),
      "---\nroleType: worker/executor\ndescription: e\n---\nebody",
    );

    const loader = new RoleTemplateLoader({
      userDir,
      projectDir,
      pluginDirs: [],
      builtInDir,
    });
    const all = await loader.loadAll();
    expect(all.map((r) => r.template.roleType).sort()).toEqual([
      "coordinator",
      "worker/executor",
    ]);
  });

  it("skips non-.md files and missing dirs gracefully", async () => {
    await fs.writeFile(path.join(builtInDir, "notes.txt"), "ignore me");
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/does-not-exist-xyz-petagent",
      projectDir,
      pluginDirs: [],
      builtInDir,
    });
    const all = await loader.loadAll();
    expect(all).toEqual([]);
  });
});
