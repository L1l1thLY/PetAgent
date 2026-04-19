// Ported from hermes-agent/agent/skill_utils.py (MIT License, Nous Research).
// See NOTICES.md for full attribution.

import * as yaml from "js-yaml";

export type Platform = "darwin" | "linux" | "win32";

export const PLATFORM_MAP: Record<string, Platform> = {
  macos: "darwin",
  linux: "linux",
  windows: "win32",
};

export const EXCLUDED_SKILL_DIRS = new Set([".git", ".github", ".hub"]);

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  requires_toolsets?: string[];
  fallback_for_toolsets?: string[];
  fallback_for_tools?: string[];
  platforms?: string[];
  [key: string]: unknown;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

/**
 * Parse YAML frontmatter (delimited by `---`) from a markdown string. Falls
 * back to simple key:value parsing if YAML is malformed.
 */
export function parseFrontmatter(content: string): ParsedSkill {
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }
  const endMatch = /\n---\s*\n/.exec(content.slice(3));
  if (!endMatch) {
    return { frontmatter: {}, body: content };
  }
  const yamlContent = content.slice(3, endMatch.index + 3);
  const body = content.slice(endMatch.index + 3 + endMatch[0].length);

  try {
    const parsed = yaml.load(yamlContent);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { frontmatter: parsed as SkillFrontmatter, body };
    }
  } catch {
    // fall through
  }

  // Fallback: naive key:value per line
  const fm: SkillFrontmatter = {};
  for (const line of yamlContent.trim().split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fm[key] = value;
  }
  return { frontmatter: fm, body };
}

/**
 * Given a skill's frontmatter + the current runtime context, decide whether
 * the skill is currently eligible. Ports Hermes's condition-activation logic.
 */
export interface ActivationContext {
  platform: Platform;
  availableToolsets: Set<string>;
  activeTools: Set<string>;
}

export function isSkillActivated(
  fm: SkillFrontmatter,
  ctx: ActivationContext,
): { activated: boolean; reason: string } {
  if (fm.platforms && fm.platforms.length > 0) {
    const normalised = fm.platforms
      .map((p) => PLATFORM_MAP[p.toLowerCase()] ?? p.toLowerCase())
      .filter(Boolean) as Platform[];
    if (!normalised.includes(ctx.platform)) {
      return { activated: false, reason: `platform ${ctx.platform} not in ${normalised.join(",")}` };
    }
  }
  if (fm.requires_toolsets && fm.requires_toolsets.length > 0) {
    for (const t of fm.requires_toolsets) {
      if (!ctx.availableToolsets.has(t)) {
        return { activated: false, reason: `missing required toolset ${t}` };
      }
    }
  }
  if (fm.fallback_for_toolsets && fm.fallback_for_toolsets.length > 0) {
    const anyActive = fm.fallback_for_toolsets.some((t) => ctx.availableToolsets.has(t));
    if (anyActive) {
      return {
        activated: false,
        reason: "fallback-only skill; primary toolset is active",
      };
    }
  }
  if (fm.fallback_for_tools && fm.fallback_for_tools.length > 0) {
    const anyActive = fm.fallback_for_tools.some((t) => ctx.activeTools.has(t));
    if (anyActive) {
      return { activated: false, reason: "fallback-only skill; primary tool is active" };
    }
  }
  return { activated: true, reason: "all activation conditions satisfied" };
}
