import { describe, it, expect } from "vitest";
import type { Agent } from "@petagent/shared";
import {
  planHire,
  assertSupportedRoleType,
  SUPPORTED_ROLE_TYPES,
} from "../commands/hire.js";

function stubAgent(name: string): Pick<Agent, "name"> {
  return { name };
}

describe("assertSupportedRoleType", () => {
  it("accepts the six M1 role types", () => {
    for (const role of SUPPORTED_ROLE_TYPES) {
      expect(assertSupportedRoleType(role)).toBe(role);
    }
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(assertSupportedRoleType("  Worker/Executor  ")).toBe("worker/executor");
    expect(assertSupportedRoleType("PSYCHOLOGIST")).toBe("psychologist");
  });

  it("rejects unknown role types with a helpful message", () => {
    expect(() => assertSupportedRoleType("engineer")).toThrow(/Unsupported --role/);
    expect(() => assertSupportedRoleType("engineer")).toThrow(/coordinator/);
  });
});

describe("planHire", () => {
  it("uses the role default name when no agents collide", () => {
    const plan = planHire({ role: "worker/executor" }, []);
    expect(plan.pickedName).toBe("Corvus");
    expect(plan.body.name).toBe("Corvus");
    expect(plan.roleType).toBe("worker/executor");
  });

  it("picks the next pronounceable name when the role default is taken", () => {
    const plan = planHire({ role: "worker/executor" }, [stubAgent("Corvus")]);
    expect(plan.pickedName).not.toBe("Corvus");
    expect(typeof plan.pickedName).toBe("string");
    expect(plan.pickedName.length).toBeGreaterThan(0);
  });

  it("uses the explicit --name when provided", () => {
    const plan = planHire({ role: "worker/executor", name: "Bob" }, [stubAgent("Corvus")]);
    expect(plan.pickedName).toBe("Bob");
    expect(plan.body.name).toBe("Bob");
  });

  it("sets adapterType=petagent and stashes roleType in adapterConfig by default", () => {
    const plan = planHire({ role: "coordinator" }, []);
    expect(plan.body.adapterType).toBe("petagent");
    expect(plan.body.adapterConfig).toEqual({ roleType: "coordinator" });
    expect(plan.body.role).toBe("general");
  });

  it("accepts --adapter-type override (e.g. claude_local) and still carries roleType", () => {
    const plan = planHire(
      { role: "worker/executor", adapterType: "claude_local" },
      [],
    );
    expect(plan.body.adapterType).toBe("claude_local");
    expect(plan.body.adapterConfig).toEqual({ roleType: "worker/executor" });
  });

  it("respects --legacy-role when provided", () => {
    const plan = planHire({ role: "worker/executor", legacyRole: "engineer" }, []);
    expect(plan.body.role).toBe("engineer");
  });

  it("converts --budget-usd to cents (rounded)", () => {
    const plan = planHire({ role: "psychologist", budgetUsd: 12.345 }, []);
    expect(plan.body.budgetMonthlyCents).toBe(1235);
  });

  it("defaults budgetMonthlyCents=0 when --budget-usd is missing", () => {
    const plan = planHire({ role: "psychologist" }, []);
    expect(plan.body.budgetMonthlyCents).toBe(0);
  });

  it("rejects negative budgets", () => {
    expect(() => planHire({ role: "psychologist", budgetUsd: -5 }, [])).toThrow(/non-negative/);
  });

  it("carries --title and --reports-to into the body when provided", () => {
    const plan = planHire(
      {
        role: "worker/executor",
        title: "Implementation Lead",
        reportsTo: "22222222-2222-2222-2222-222222222222",
      },
      [],
    );
    expect(plan.body.title).toBe("Implementation Lead");
    expect(plan.body.reportsTo).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("omits title/reportsTo when they are empty strings", () => {
    const plan = planHire({ role: "coordinator", title: "   ", reportsTo: "" }, []);
    expect(plan.body.title).toBeUndefined();
    expect(plan.body.reportsTo).toBeUndefined();
  });
});
