import { api } from "./client";

export type RoleTemplateSource = "user" | "project" | "plugin" | "built-in";

export interface RoleTemplateDescriptor {
  roleType: string;
  description: string;
  promptPreview: string;
  tools: string[];
  disallowedTools: string[];
  mcpServers: string[];
  model: string | null;
  isolation: "none" | "worktree" | "remote";
  background: boolean;
  skills: string[];
  source: RoleTemplateSource;
  path: string;
}

export const roleTemplatesApi = {
  list: () => api.get<RoleTemplateDescriptor[]>("/role-templates"),
};
