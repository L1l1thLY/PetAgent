import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { RoleTemplateLoader } from "@petagent/role-template";
import {
  STARTER_SKILL_ROLES,
  starterSkillRoleFor,
  starterSkillsRoot,
  resolveStarterSkillPath,
  listStarterSkillsForRole,
  listAllStarterSkills,
  parseFrontmatter,
  type StarterSkillRole,
} from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const builtInRolesDir = path.resolve(
  __dirname,
  "..",
  "..",
  "my-agent-adapter",
  "built-in-roles",
);

const EXPECTED_SKILLS_BY_ROLE: Record<StarterSkillRole, string[]> = {
  coordinator: ["issue-decomposition", "dispatch-by-role-strengths"],
  explorer: ["use-grep-and-glob", "summarize-findings"],
  planner: ["write-implementation-plan", "identify-critical-files"],
  executor: ["write-failing-test-first", "minimal-diff", "verify-before-commit"],
  reviewer: ["methodical-review-checklist", "recognize-rationalizations"],
  psychologist: ["behavior-triangulation", "metacognitive-reframing"],
};

describe("starterSkillRoleFor", () => {
  it("maps worker/* roleTypes to the flat role subdir", () => {
    expect(starterSkillRoleFor("worker/explorer")).toBe("explorer");
    expect(starterSkillRoleFor("worker/planner")).toBe("planner");
    expect(starterSkillRoleFor("worker/executor")).toBe("executor");
    expect(starterSkillRoleFor("worker/reviewer")).toBe("reviewer");
  });

  it("maps coordinator and psychologist directly", () => {
    expect(starterSkillRoleFor("coordinator")).toBe("coordinator");
    expect(starterSkillRoleFor("psychologist")).toBe("psychologist");
  });

  it("returns null for unknown roleTypes", () => {
    expect(starterSkillRoleFor("some/other")).toBeNull();
    expect(starterSkillRoleFor("")).toBeNull();
  });
});

describe("starterSkillsRoot", () => {
  it("points at packages/templates/src/starter-skills", async () => {
    const root = starterSkillsRoot();
    const stat = await fs.stat(root);
    expect(stat.isDirectory()).toBe(true);
    expect(root.endsWith("starter-skills")).toBe(true);
  });
});

describe.each(STARTER_SKILL_ROLES)("starter skills: %s", (role) => {
  it("contains exactly the expected skill set", async () => {
    const skills = await listStarterSkillsForRole(role);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual([...EXPECTED_SKILLS_BY_ROLE[role]].sort());
  });

  it("every skill has a non-empty frontmatter description", async () => {
    const skills = await listStarterSkillsForRole(role);
    for (const s of skills) {
      expect(s.description.length, `${role}/${s.name} description`).toBeGreaterThan(10);
    }
  });

  it("every skill's frontmatter.name matches its directory slug", async () => {
    for (const name of EXPECTED_SKILLS_BY_ROLE[role]) {
      const text = await fs.readFile(resolveStarterSkillPath(role, name), "utf8");
      const fm = parseFrontmatter(text) as Record<string, unknown>;
      expect(fm.name, `${role}/${name}`).toBe(name);
    }
  });
});

describe("listAllStarterSkills", () => {
  it("returns the full cross-role set of 13 skills", async () => {
    const all = await listAllStarterSkills();
    const expectedTotal = Object.values(EXPECTED_SKILLS_BY_ROLE).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(all.length).toBe(expectedTotal);
  });
});

describe("role template skills fields are in sync with starter skills", () => {
  it("every built-in role template declares only skills that exist on disk", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/petagent-nox-u",
      projectDir: "/tmp/petagent-nox-p",
      pluginDirs: [],
      builtInDir: builtInRolesDir,
    });
    const loaded = await loader.loadAll();
    expect(loaded.length).toBe(6);

    for (const entry of loaded) {
      const role = starterSkillRoleFor(entry.template.roleType);
      if (role === null) {
        // Not a PetAgent-native role; nothing to verify.
        continue;
      }
      const declared = entry.template.skills ?? [];
      expect(declared.length, `${entry.template.roleType} should declare starter skills`).toBeGreaterThan(0);
      for (const skillName of declared) {
        const p = resolveStarterSkillPath(role, skillName);
        const stat = await fs.stat(p).catch(() => null);
        expect(stat, `expected SKILL.md at ${p}`).not.toBeNull();
      }
    }
  });

  it("role template declared set matches the canonical list for each role", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/petagent-nox-u",
      projectDir: "/tmp/petagent-nox-p",
      pluginDirs: [],
      builtInDir: builtInRolesDir,
    });
    const loaded = await loader.loadAll();
    for (const entry of loaded) {
      const role = starterSkillRoleFor(entry.template.roleType);
      if (role === null) continue;
      const declared = (entry.template.skills ?? []).slice().sort();
      const expected = [...EXPECTED_SKILLS_BY_ROLE[role]].sort();
      expect(declared, `${entry.template.roleType}`).toEqual(expected);
    }
  });
});
