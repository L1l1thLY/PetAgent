import { describe, it, expect } from "vitest";
import { parseFrontmatter, isSkillActivated } from "./skill_utils.js";

describe("parseFrontmatter", () => {
  it("parses yaml frontmatter", () => {
    const md = `---
name: hello
description: says hi
platforms:
  - darwin
  - linux
---

# Body

hello world
`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.name).toBe("hello");
    expect(frontmatter.platforms).toEqual(["darwin", "linux"]);
    expect(body).toContain("# Body");
  });

  it("returns empty frontmatter when no delimiter", () => {
    const { frontmatter, body } = parseFrontmatter("# just a body");
    expect(frontmatter).toEqual({});
    expect(body).toBe("# just a body");
  });

  it("falls back to naive parse on malformed yaml", () => {
    const md = "---\nname: x\nbroken: [not-closed\n---\nbody";
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.name).toBe("x");
  });
});

describe("isSkillActivated", () => {
  const ctx = {
    platform: "darwin" as const,
    availableToolsets: new Set(["Bash", "Read", "Edit"]),
    activeTools: new Set<string>(),
  };

  it("activates when no conditions", () => {
    expect(isSkillActivated({}, ctx).activated).toBe(true);
  });

  it("deactivates when platform mismatch", () => {
    const r = isSkillActivated({ platforms: ["windows"] }, ctx);
    expect(r.activated).toBe(false);
  });

  it("activates when platform matches via alias (macos -> darwin)", () => {
    const r = isSkillActivated({ platforms: ["macos"] }, ctx);
    expect(r.activated).toBe(true);
  });

  it("deactivates when required toolset missing", () => {
    const r = isSkillActivated({ requires_toolsets: ["WebFetch"] }, ctx);
    expect(r.activated).toBe(false);
  });

  it("deactivates fallback when primary toolset is active", () => {
    const r = isSkillActivated({ fallback_for_toolsets: ["Bash"] }, ctx);
    expect(r.activated).toBe(false);
    expect(r.reason).toContain("fallback-only");
  });

  it("activates fallback when primary toolset is NOT active", () => {
    const r = isSkillActivated({ fallback_for_toolsets: ["WebFetch"] }, ctx);
    expect(r.activated).toBe(true);
  });
});
