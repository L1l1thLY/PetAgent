import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PetAgentApiClient } from "./client.js";
import { readConfigFromEnv, type PetAgentMcpConfig } from "./config.js";
import { createToolDefinitions } from "./tools.js";

export function createPetAgentMcpServer(config: PetAgentMcpConfig = readConfigFromEnv()) {
  const server = new McpServer({
    name: "petagent",
    version: "0.1.0",
  });

  const client = new PetAgentApiClient(config);
  const tools = createToolDefinitions(client);
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema.shape, tool.execute);
  }

  return {
    server,
    tools,
    client,
  };
}

export async function runServer(config: PetAgentMcpConfig = readConfigFromEnv()) {
  const { server } = createPetAgentMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
