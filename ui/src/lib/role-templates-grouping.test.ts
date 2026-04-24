import { describe, it, expect } from "vitest";
import type { RoleTemplateDescriptor } from "../api/role-templates";
import { groupRoleTemplates, ROLE_SOURCE_ORDER } from "./role-templates-grouping";

function tmpl(overrides: Partial<RoleTemplateDescriptor>): RoleTemplateDescriptor {
  return {
    roleType: "coordinator",
    description: "Thin coordinator",
    promptPreview: "You are a Coordinator.",
    tools: [],
    disallowedTools: [],
    mcpServers: [],
    model: null,
    isolation: "none",
    background: false,
    skills: [],
    source: "built-in",
    path: "/tmp/role.md",
    ...overrides,
  };
}

describe("ROLE_SOURCE_ORDER", () => {
  it("is lowest → highest: built-in → plugin → project → user", () => {
    expect(ROLE_SOURCE_ORDER).toEqual(["built-in", "plugin", "project", "user"]);
  });
});

describe("groupRoleTemplates", () => {
  it("groups by source in display order", () => {
    const groups = groupRoleTemplates([
      tmpl({ roleType: "coordinator", source: "built-in" }),
      tmpl({ roleType: "custom-role", source: "user" }),
      tmpl({ roleType: "project-custom", source: "project" }),
    ]);
    expect(groups.map((g) => g.source)).toEqual(["built-in", "project", "user"]);
  });

  it("omits groups that have zero templates", () => {
    const groups = groupRoleTemplates([
      tmpl({ roleType: "x", source: "built-in" }),
    ]);
    expect(groups.map((g) => g.source)).toEqual(["built-in"]);
  });

  it("sorts templates alphabetically within each group", () => {
    const groups = groupRoleTemplates([
      tmpl({ roleType: "worker/reviewer" }),
      tmpl({ roleType: "coordinator" }),
      tmpl({ roleType: "worker/executor" }),
    ]);
    expect(groups[0].templates.map((t) => t.roleType)).toEqual([
      "coordinator",
      "worker/executor",
      "worker/reviewer",
    ]);
  });

  it("filters by search across roleType / description / model / tools / skills", () => {
    const list = [
      tmpl({ roleType: "coordinator", description: "Thin coordinator" }),
      tmpl({ roleType: "worker/executor", description: "Fat worker", tools: ["Bash"] }),
      tmpl({ roleType: "worker/planner", description: "Architect", skills: ["write-plan"] }),
    ];
    expect(
      groupRoleTemplates(list, { search: "fat" })
        .flatMap((g) => g.templates)
        .map((t) => t.roleType),
    ).toEqual(["worker/executor"]);

    expect(
      groupRoleTemplates(list, { search: "write-plan" })
        .flatMap((g) => g.templates)
        .map((t) => t.roleType),
    ).toEqual(["worker/planner"]);

    expect(
      groupRoleTemplates(list, { search: "Bash" })
        .flatMap((g) => g.templates)
        .map((t) => t.roleType),
    ).toEqual(["worker/executor"]);
  });

  it("case-insensitive search", () => {
    const groups = groupRoleTemplates([tmpl({ roleType: "Coordinator" })], {
      search: "COORD",
    });
    expect(groups[0].templates.map((t) => t.roleType)).toEqual(["Coordinator"]);
  });

  it("returns empty array when search matches nothing", () => {
    const groups = groupRoleTemplates([tmpl({ roleType: "coordinator" })], {
      search: "banana",
    });
    expect(groups).toEqual([]);
  });
});
