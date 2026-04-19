// Ported surface from hermes-agent/agent/skill_commands.py (MIT License, Nous Research).
// See NOTICES.md for full attribution.
//
// M1 scope: @save-as-skill directive parsing. Full command surface (grant,
// revoke, share, subscribe) wires up once the CLI commands and server routes
// land in Group 5 and Group 9.

export interface SaveAsSkillDirective {
  kind: "save-as-skill";
  name: string;
  description: string | null;
  scope: "workspace" | "agent";
}

const SAVE_PATTERN =
  /@save-as-skill\s*(?:\(\s*(?:name=([\w-]+))?\s*(?:,\s*scope=(workspace|agent))?\s*\))?\s*(.*)/i;

export function parseSaveAsSkill(input: string): SaveAsSkillDirective | null {
  const match = SAVE_PATTERN.exec(input.trim());
  if (!match) return null;
  const name = match[1] ?? "unnamed-skill";
  const scope = (match[2] as "workspace" | "agent" | undefined) ?? "workspace";
  const trailing = (match[3] ?? "").trim();
  return {
    kind: "save-as-skill",
    name,
    description: trailing || null,
    scope,
  };
}
