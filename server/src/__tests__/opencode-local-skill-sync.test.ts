import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listOpenCodeSkills,
  syncOpenCodeSkills,
} from "@petagent/adapter-opencode-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("opencode local skill sync", () => {
  const petagentKey = "petagent/petagent/petagent";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured PetAgent skills and installs them into the shared Claude/OpenCode skills home", async () => {
    const home = await makeTempDir("petagent-opencode-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "opencode_local",
      config: {
        env: {
          HOME: home,
        },
        petagentSkillSync: {
          desiredSkills: [petagentKey],
        },
      },
    } as const;

    const before = await listOpenCodeSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.warnings).toContain("OpenCode currently uses the shared Claude skills home (~/.claude/skills).");
    expect(before.desiredSkills).toContain(petagentKey);
    expect(before.entries.find((entry) => entry.key === petagentKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === petagentKey)?.state).toBe("missing");

    const after = await syncOpenCodeSkills(ctx, [petagentKey]);
    expect(after.entries.find((entry) => entry.key === petagentKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".claude", "skills", "petagent"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled PetAgent skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("petagent-opencode-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "opencode_local",
      config: {
        env: {
          HOME: home,
        },
        petagentSkillSync: {
          desiredSkills: [petagentKey],
        },
      },
    } as const;

    await syncOpenCodeSkills(configuredCtx, [petagentKey]);

    const clearedCtx = {
      ...configuredCtx,
      config: {
        env: {
          HOME: home,
        },
        petagentSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncOpenCodeSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(petagentKey);
    expect(after.entries.find((entry) => entry.key === petagentKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".claude", "skills", "petagent"))).isSymbolicLink()).toBe(true);
  });
});
