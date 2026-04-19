import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/db",
      "packages/hooks",
      "packages/safety-net",
      "packages/skills",
      "packages/adapters/codex-local",
      "packages/adapters/opencode-local",
      "server",
      "ui",
      "cli",
    ],
  },
});
