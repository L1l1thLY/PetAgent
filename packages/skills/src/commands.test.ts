import { describe, it, expect } from "vitest";
import { parseSaveAsSkill } from "./commands.js";

describe("parseSaveAsSkill", () => {
  it("parses bare @save-as-skill", () => {
    const d = parseSaveAsSkill("@save-as-skill");
    expect(d?.name).toBe("unnamed-skill");
    expect(d?.scope).toBe("workspace");
  });

  it("parses named directive", () => {
    const d = parseSaveAsSkill("@save-as-skill(name=run-ci) how to trigger the CI");
    expect(d?.name).toBe("run-ci");
    expect(d?.description).toBe("how to trigger the CI");
  });

  it("parses agent-scoped directive", () => {
    const d = parseSaveAsSkill("@save-as-skill(name=my-tip, scope=agent) remember to flush");
    expect(d?.name).toBe("my-tip");
    expect(d?.scope).toBe("agent");
  });

  it("returns null on unrelated text", () => {
    expect(parseSaveAsSkill("hello world")).toBeNull();
  });
});
