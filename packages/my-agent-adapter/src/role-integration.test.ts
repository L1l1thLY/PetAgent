import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { RoleTemplateLoader } from "@petagent/role-template";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const builtInDir = path.resolve(__dirname, "..", "built-in-roles");

const EXPECTED_ROLES = [
  "coordinator",
  "worker/explorer",
  "worker/planner",
  "worker/executor",
  "worker/reviewer",
  "psychologist",
] as const;

const STRUCTURED_REQUIRED = new Set<string>([
  "coordinator",
  "worker/explorer",
  "worker/planner",
  "worker/executor",
  "worker/reviewer",
]);

describe("built-in role templates", () => {
  it("loads all six bundled roles without error", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/petagent-no-such-user-dir",
      projectDir: "/tmp/petagent-no-such-project-dir",
      pluginDirs: [],
      builtInDir,
    });
    const loaded = await loader.loadAll();
    const types = loaded.map((r) => r.template.roleType).sort();
    expect(types).toEqual([...EXPECTED_ROLES].sort());
  });

  it("every role has a non-empty prompt body", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/x1",
      projectDir: "/tmp/x2",
      pluginDirs: [],
      builtInDir,
    });
    const loaded = await loader.loadAll();
    for (const entry of loaded) {
      expect(entry.template.prompt.length).toBeGreaterThan(50);
    }
  });

  it("roles that need structured output declare a valid protocol", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/x1",
      projectDir: "/tmp/x2",
      pluginDirs: [],
      builtInDir,
    });
    const loaded = await loader.loadAll();
    for (const entry of loaded) {
      if (!STRUCTURED_REQUIRED.has(entry.template.roleType)) continue;
      const proto = entry.template.structured_output_protocol;
      expect(proto, `${entry.template.roleType} must declare structured_output_protocol`).toBeDefined();
      expect(proto!.required).toBe(true);
      expect(proto!.sentinel ?? proto!.regex, `${entry.template.roleType} needs sentinel or regex`).toBeTruthy();
    }
  });

  it("read-only roles disallow file/shell mutation tools", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/x1",
      projectDir: "/tmp/x2",
      pluginDirs: [],
      builtInDir,
    });
    const loaded = await loader.loadAll();
    const byType = new Map(loaded.map((r) => [r.template.roleType, r.template]));

    const explorer = byType.get("worker/explorer")!;
    expect(explorer.disallowedTools).toEqual(
      expect.arrayContaining(["FileEdit", "FileWrite", "Bash", "NotebookEdit"]),
    );
    expect(explorer.tools).not.toContain("Bash");

    const planner = byType.get("worker/planner")!;
    expect(planner.disallowedTools).toEqual(
      expect.arrayContaining(["FileEdit", "FileWrite", "Bash", "NotebookEdit"]),
    );

    const reviewer = byType.get("worker/reviewer")!;
    expect(reviewer.disallowedTools).toEqual(
      expect.arrayContaining(["FileEdit", "FileWrite", "NotebookEdit"]),
    );
    expect(reviewer.tools).toContain("Bash");

    const coord = byType.get("coordinator")!;
    expect(coord.disallowedTools).toEqual(
      expect.arrayContaining(["Bash", "FileEdit", "FileWrite", "NotebookEdit"]),
    );

    const executor = byType.get("worker/executor")!;
    expect(executor.tools).toEqual(["*"]);
    expect(executor.isolation).toBe("worktree");
  });

  it("psychologist runs in background with intervention tools", async () => {
    const loader = new RoleTemplateLoader({
      userDir: "/tmp/x1",
      projectDir: "/tmp/x2",
      pluginDirs: [],
      builtInDir,
    });
    const loaded = await loader.loadAll();
    const psych = loaded.find((r) => r.template.roleType === "psychologist");
    expect(psych).toBeDefined();
    expect(psych!.template.background).toBe(true);
    expect(psych!.template.tools).toEqual(
      expect.arrayContaining(["InstructionsInject", "BoardComment", "IssuePause", "IssueSplit"]),
    );
  });
});
