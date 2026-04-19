import fs from "node:fs";
import { petagentConfigSchema, type PetAgentConfig } from "@petagent/shared";
import { resolvePetAgentConfigPath } from "./paths.js";

export function readConfigFile(): PetAgentConfig | null {
  const configPath = resolvePetAgentConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return petagentConfigSchema.parse(raw);
  } catch {
    return null;
  }
}
