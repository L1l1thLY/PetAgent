import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/db",
      "packages/hooks",
      "packages/safety-net",
      "packages/skills",
      "packages/role-template",
      "packages/my-agent-adapter",
      "packages/psychologist",
      "packages/templates",
      "packages/adapters/codex-local",
      "packages/adapters/opencode-local",
      "server",
      "ui",
      "cli",
    ],
  },
});
