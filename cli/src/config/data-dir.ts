import path from "node:path";
import {
  expandHomePrefix,
  resolveDefaultConfigPath,
  resolveDefaultContextPath,
  resolvePetAgentInstanceId,
} from "./home.js";

export interface DataDirOptionLike {
  dataDir?: string;
  config?: string;
  context?: string;
  instance?: string;
}

export interface DataDirCommandSupport {
  hasConfigOption?: boolean;
  hasContextOption?: boolean;
}

export function applyDataDirOverride(
  options: DataDirOptionLike,
  support: DataDirCommandSupport = {},
): string | null {
  const rawDataDir = options.dataDir?.trim();
  if (!rawDataDir) return null;

  const resolvedDataDir = path.resolve(expandHomePrefix(rawDataDir));
  process.env.PETAGENT_HOME = resolvedDataDir;

  if (support.hasConfigOption) {
    const hasConfigOverride = Boolean(options.config?.trim()) || Boolean(process.env.PETAGENT_CONFIG?.trim());
    if (!hasConfigOverride) {
      const instanceId = resolvePetAgentInstanceId(options.instance);
      process.env.PETAGENT_INSTANCE_ID = instanceId;
      process.env.PETAGENT_CONFIG = resolveDefaultConfigPath(instanceId);
    }
  }

  if (support.hasContextOption) {
    const hasContextOverride = Boolean(options.context?.trim()) || Boolean(process.env.PETAGENT_CONTEXT?.trim());
    if (!hasContextOverride) {
      process.env.PETAGENT_CONTEXT = resolveDefaultContextPath();
    }
  }

  return resolvedDataDir;
}
