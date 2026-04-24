import { describe, it, expect } from "vitest";
import type { RoleTemplateDescriptor } from "../api/role-templates";
import {
  buildHireFormDefaults,
  buildHirePayload,
  decodeDragRoleType,
  encodeDragRoleType,
  hasErrors,
  validateHireForm,
  type HireFormState,
} from "./hire-form";

function descriptor(overrides: Partial<RoleTemplateDescriptor> = {}): RoleTemplateDescriptor {
  return {
    roleType: "worker/executor",
    description: "Fat worker",
    promptPreview: "You are the Executor.",
    tools: ["*"],
    disallowedTools: [],
    mcpServers: [],
    model: "claude-sonnet-4-6",
    isolation: "worktree",
    background: false,
    skills: ["minimal-diff"],
    source: "built-in",
    path: "/tmp/worker-executor.md",
    ...overrides,
  };
}

function state(overrides: Partial<HireFormState> = {}): HireFormState {
  return {
    name: "Corvus",
    title: "",
    legacyRole: "general",
    adapterType: "petagent",
    roleType: "worker/executor",
    model: "",
    budgetUsd: "0",
    isolation: "worktree",
    reportsTo: "",
    skills: "",
    ...overrides,
  };
}

describe("buildHireFormDefaults", () => {
  it("seeds form state from the role template (no name; joined skills)", () => {
    const s = buildHireFormDefaults(descriptor());
    expect(s.name).toBe("");
    expect(s.roleType).toBe("worker/executor");
    expect(s.model).toBe("claude-sonnet-4-6");
    expect(s.isolation).toBe("worktree");
    expect(s.skills).toBe("minimal-diff");
    expect(s.adapterType).toBe("petagent");
    expect(s.legacyRole).toBe("general");
  });

  it("handles templates with no model / empty skills", () => {
    const s = buildHireFormDefaults(descriptor({ model: null, skills: [] }));
    expect(s.model).toBe("");
    expect(s.skills).toBe("");
  });
});

describe("validateHireForm", () => {
  it("returns no errors on a valid form", () => {
    expect(validateHireForm(state({ name: "Corvus", budgetUsd: "15" }))).toEqual({});
  });

  it("flags a missing name", () => {
    const errors = validateHireForm(state({ name: "   " }));
    expect(errors.name).toMatch(/required/i);
  });

  it("flags an empty roleType", () => {
    const errors = validateHireForm(state({ roleType: "" }));
    expect(errors.roleType).toMatch(/required/i);
  });

  it("flags an empty adapterType", () => {
    const errors = validateHireForm(state({ adapterType: " " }));
    expect(errors.adapterType).toMatch(/required/i);
  });

  it("flags a negative or non-numeric budget", () => {
    expect(validateHireForm(state({ budgetUsd: "-5" })).budgetUsd).toMatch(/non-negative/);
    expect(validateHireForm(state({ budgetUsd: "abc" })).budgetUsd).toMatch(/non-negative/);
  });

  it("accepts zero and fractional budgets", () => {
    expect(validateHireForm(state({ budgetUsd: "0" })).budgetUsd).toBeUndefined();
    expect(validateHireForm(state({ budgetUsd: "12.5" })).budgetUsd).toBeUndefined();
  });
});

describe("hasErrors", () => {
  it("returns true iff the errors object is non-empty", () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ name: "x" })).toBe(true);
  });
});

describe("buildHirePayload", () => {
  it("wraps roleType inside adapterConfig + budget -> cents", () => {
    const payload = buildHirePayload(state({ budgetUsd: "12.5" }));
    expect(payload).toMatchObject({
      name: "Corvus",
      role: "general",
      adapterType: "petagent",
      adapterConfig: { roleType: "worker/executor" },
      budgetMonthlyCents: 1250,
    });
  });

  it("includes desiredSkills only when the CSV field has content", () => {
    const withSkills = buildHirePayload(state({ skills: "a, b ,, c" }));
    expect(withSkills.desiredSkills).toEqual(["a", "b", "c"]);

    const empty = buildHirePayload(state({ skills: "" }));
    expect(empty.desiredSkills).toBeUndefined();
  });

  it("stashes model inside adapterConfig when set", () => {
    const payload = buildHirePayload(state({ model: "claude-haiku-4-5-20251001" }));
    expect((payload.adapterConfig as Record<string, unknown>).model).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("omits title/reportsTo when blank", () => {
    const payload = buildHirePayload(state({ title: "  ", reportsTo: "" }));
    expect(payload.title).toBeUndefined();
    expect(payload.reportsTo).toBeUndefined();
  });

  it("defaults legacyRole to 'general' when blank", () => {
    const payload = buildHirePayload(state({ legacyRole: "" }));
    expect(payload.role).toBe("general");
  });
});

describe("drag payload helpers", () => {
  it("encodeDragRoleType returns the string verbatim", () => {
    expect(encodeDragRoleType("worker/executor")).toBe("worker/executor");
  });

  it("decodeDragRoleType strips whitespace and returns null on empty", () => {
    expect(decodeDragRoleType("  worker/executor  ")).toBe("worker/executor");
    expect(decodeDragRoleType("")).toBeNull();
    expect(decodeDragRoleType("   ")).toBeNull();
  });
});
