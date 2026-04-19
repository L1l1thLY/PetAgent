import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureCodexSkillsInjected } from "@petagent/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createPetAgentRepoSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "server"), { recursive: true });
  await fs.mkdir(path.join(root, "packages", "adapter-utils"), { recursive: true });
  await fs.mkdir(path.join(root, "skills", skillName), { recursive: true });
  await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  await fs.writeFile(path.join(root, "package.json"), '{"name":"petagent"}\n', "utf8");
  await fs.writeFile(
    path.join(root, "skills", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

async function createCustomSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "custom", skillName), { recursive: true });
  await fs.writeFile(
    path.join(root, "custom", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

describe("codex local adapter skill injection", () => {
  const petagentKey = "petagent/petagent/petagent";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("repairs a Codex PetAgent skill symlink that still points at another live checkout", async () => {
    const currentRepo = await makeTempDir("petagent-codex-current-");
    const oldRepo = await makeTempDir("petagent-codex-old-");
    const skillsHome = await makeTempDir("petagent-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(oldRepo);
    cleanupDirs.add(skillsHome);

    await createPetAgentRepoSkill(currentRepo, "petagent");
    await createPetAgentRepoSkill(oldRepo, "petagent");
    await fs.symlink(path.join(oldRepo, "skills", "petagent"), path.join(skillsHome, "petagent"));

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    await ensureCodexSkillsInjected(
      async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      {
        skillsHome,
        skillsEntries: [{
          key: petagentKey,
          runtimeName: "petagent",
          source: path.join(currentRepo, "skills", "petagent"),
        }],
      },
    );

    expect(await fs.realpath(path.join(skillsHome, "petagent"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "petagent")),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Repaired Codex skill "petagent"'),
      }),
    );
  });

  it("preserves a custom Codex skill symlink outside PetAgent repo checkouts", async () => {
    const currentRepo = await makeTempDir("petagent-codex-current-");
    const customRoot = await makeTempDir("petagent-codex-custom-");
    const skillsHome = await makeTempDir("petagent-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(customRoot);
    cleanupDirs.add(skillsHome);

    await createPetAgentRepoSkill(currentRepo, "petagent");
    await createCustomSkill(customRoot, "petagent");
    await fs.symlink(path.join(customRoot, "custom", "petagent"), path.join(skillsHome, "petagent"));

    await ensureCodexSkillsInjected(async () => {}, {
      skillsHome,
      skillsEntries: [{
        key: petagentKey,
        runtimeName: "petagent",
        source: path.join(currentRepo, "skills", "petagent"),
      }],
    });

    expect(await fs.realpath(path.join(skillsHome, "petagent"))).toBe(
      await fs.realpath(path.join(customRoot, "custom", "petagent")),
    );
  });

  it("prunes broken symlinks for unavailable PetAgent repo skills before Codex starts", async () => {
    const currentRepo = await makeTempDir("petagent-codex-current-");
    const oldRepo = await makeTempDir("petagent-codex-old-");
    const skillsHome = await makeTempDir("petagent-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(oldRepo);
    cleanupDirs.add(skillsHome);

    await createPetAgentRepoSkill(currentRepo, "petagent");
    await createPetAgentRepoSkill(oldRepo, "agent-browser");
    const staleTarget = path.join(oldRepo, "skills", "agent-browser");
    await fs.symlink(staleTarget, path.join(skillsHome, "agent-browser"));
    await fs.rm(staleTarget, { recursive: true, force: true });

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    await ensureCodexSkillsInjected(
      async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      {
        skillsHome,
        skillsEntries: [{
          key: petagentKey,
          runtimeName: "petagent",
          source: path.join(currentRepo, "skills", "petagent"),
        }],
      },
    );

    await expect(fs.lstat(path.join(skillsHome, "agent-browser"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Removed stale Codex skill "agent-browser"'),
      }),
    );
  });

  it("preserves other live PetAgent skill symlinks in the shared workspace skill directory", async () => {
    const currentRepo = await makeTempDir("petagent-codex-current-");
    const skillsHome = await makeTempDir("petagent-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(skillsHome);

    await createPetAgentRepoSkill(currentRepo, "petagent");
    await createPetAgentRepoSkill(currentRepo, "agent-browser");
    await fs.symlink(
      path.join(currentRepo, "skills", "agent-browser"),
      path.join(skillsHome, "agent-browser"),
    );

    await ensureCodexSkillsInjected(async () => {}, {
      skillsHome,
      skillsEntries: [{
        key: petagentKey,
        runtimeName: "petagent",
        source: path.join(currentRepo, "skills", "petagent"),
      }],
    });

    expect((await fs.lstat(path.join(skillsHome, "petagent"))).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(path.join(skillsHome, "agent-browser"))).isSymbolicLink()).toBe(true);
    expect(await fs.realpath(path.join(skillsHome, "agent-browser"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "agent-browser")),
    );
  });
});
