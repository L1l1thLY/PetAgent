import { z } from "zod";

export const StructuredOutputProtocolSchema = z.object({
  format: z.enum(["findings", "critical_files", "verdict", "summary", "custom"]),
  regex: z.string().optional(),
  required: z.boolean(),
  sentinel: z.string().optional(),
});

export const SESSION_HOOK_EVENTS = [
  "on_start",
  "after_tool_use",
  "before_stop",
  "on_error",
] as const;
export type SessionHookEvent = (typeof SESSION_HOOK_EVENTS)[number];

export const SessionHookSpecSchema = z.object({
  event: z.enum(SESSION_HOOK_EVENTS),
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
});
export type SessionHookSpec = z.infer<typeof SessionHookSpecSchema>;

export const RoleTemplateSchema = z.object({
  roleType: z.string(),
  description: z.string().min(1),
  prompt: z.string().min(1),
  initialPrompt: z.string().optional(),
  color: z.string().optional(),
  tools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  mcpServers: z.array(z.string().min(1)).optional(),
  skills: z.array(z.string()).optional(),
  model: z.string().optional(),
  effort: z
    .union([z.enum(["low", "medium", "high"]), z.number().int().positive()])
    .optional(),
  maxTurns: z.number().int().positive().optional(),
  isolation: z.enum(["none", "worktree", "remote"]).default("none"),
  background: z.boolean().optional(),
  memory: z.enum(["user", "project", "local"]).default("project"),
  permissionMode: z
    .enum(["strict", "approve-all", "auto", "readonly"])
    .optional(),
  hooks: z.array(SessionHookSpecSchema).optional(),
  structured_output_protocol: StructuredOutputProtocolSchema.optional(),
});

export type RoleTemplate = z.infer<typeof RoleTemplateSchema>;
export type StructuredOutputProtocol = z.infer<
  typeof StructuredOutputProtocolSchema
>;

export type RoleSource = "user" | "project" | "plugin" | "built-in";
