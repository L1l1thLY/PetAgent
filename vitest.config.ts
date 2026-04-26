import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/db",
      "packages/hooks",
      "packages/llm-providers",
      "packages/safety-net",
      "packages/skill-miner",
      "packages/skills",
      "packages/role-template",
      "packages/my-agent-adapter",
      "packages/psychologist",
      "packages/reflector",
      "packages/secrets",
      "packages/templates",
      "packages/adapters/codex-local",
      "packages/adapters/opencode-local",
      "server",
      "ui",
      "cli",
    ],
  },
});
