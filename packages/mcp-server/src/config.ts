export interface PetAgentMcpConfig {
  apiUrl: string;
  apiKey: string;
  companyId: string | null;
  agentId: string | null;
  runId: string | null;
}

function nonEmpty(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizeApiUrl(apiUrl: string): string {
  const trimmed = stripTrailingSlash(apiUrl.trim());
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export function readConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PetAgentMcpConfig {
  const apiUrl = nonEmpty(env.PETAGENT_API_URL);
  if (!apiUrl) {
    throw new Error("Missing PETAGENT_API_URL");
  }
  const apiKey = nonEmpty(env.PETAGENT_API_KEY);
  if (!apiKey) {
    throw new Error("Missing PETAGENT_API_KEY");
  }

  return {
    apiUrl: normalizeApiUrl(apiUrl),
    apiKey,
    companyId: nonEmpty(env.PETAGENT_COMPANY_ID),
    agentId: nonEmpty(env.PETAGENT_AGENT_ID),
    runId: nonEmpty(env.PETAGENT_RUN_ID),
  };
}
