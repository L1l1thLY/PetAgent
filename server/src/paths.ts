import fs from "node:fs";
import path from "node:path";
import { resolveDefaultConfigPath } from "./home-paths.js";

const PETAGENT_CONFIG_BASENAME = "config.json";
const PETAGENT_ENV_FILENAME = ".env";

function findConfigFileFromAncestors(startDir: string): string | null {
  const absoluteStartDir = path.resolve(startDir);
  let currentDir = absoluteStartDir;

  while (true) {
    const candidate = path.resolve(currentDir, ".petagent", PETAGENT_CONFIG_BASENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const nextDir = path.resolve(currentDir, "..");
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }

  return null;
}

export function resolvePetAgentConfigPath(overridePath?: string): string {
  if (overridePath) return path.resolve(overridePath);
  if (process.env.PETAGENT_CONFIG) return path.resolve(process.env.PETAGENT_CONFIG);
  return findConfigFileFromAncestors(process.cwd()) ?? resolveDefaultConfigPath();
}

export function resolvePetAgentEnvPath(overrideConfigPath?: string): string {
  return path.resolve(path.dirname(resolvePetAgentConfigPath(overrideConfigPath)), PETAGENT_ENV_FILENAME);
}
