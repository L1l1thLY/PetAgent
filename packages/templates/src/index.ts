import * as path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PACKAGE_ROOT = path.resolve(__dirname, "..");

export const TEMPLATE_NAMES = ["solo-pack", "small-dev-team", "hybrid-team"] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export interface TemplateDescriptor {
  name: TemplateName;
  root: string;
  companyName: string;
  description: string;
  slug: string;
  agentCount: number;
}

export function resolveTemplateRoot(name: TemplateName): string {
  return path.join(PACKAGE_ROOT, name);
}

export async function listTemplates(): Promise<TemplateDescriptor[]> {
  const out: TemplateDescriptor[] = [];
  for (const name of TEMPLATE_NAMES) {
    out.push(await describeTemplate(name));
  }
  return out;
}

export async function describeTemplate(name: TemplateName): Promise<TemplateDescriptor> {
  const root = resolveTemplateRoot(name);
  const companyMd = await fs.readFile(path.join(root, "COMPANY.md"), "utf8");
  const fm = parseFrontmatter(companyMd);
  const agents = await listAgentDirs(root);
  return {
    name,
    root,
    companyName: stringField(fm, "name", "(unnamed)"),
    description: stringField(fm, "description", ""),
    slug: stringField(fm, "slug", name),
    agentCount: agents.length,
  };
}

export interface CompanyFrontmatter {
  schema?: string;
  name?: string;
  description?: string;
  slug?: string;
  version?: string;
  license?: string;
  authors?: Array<{ name: string }>;
  goals?: string[];
  [key: string]: unknown;
}

export function parseFrontmatter(markdown: string): CompanyFrontmatter {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};
  const data = yaml.load(match[1]);
  return (data && typeof data === "object" ? data : {}) as CompanyFrontmatter;
}

export async function listAgentDirs(templateRoot: string): Promise<string[]> {
  const agentsDir = path.join(templateRoot, "agents");
  try {
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function stringField(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}

// ─── Starter Skills ───────────────────────────────────────────────────────────

export const STARTER_SKILL_ROLES = [
  "coordinator",
  "explorer",
  "planner",
  "executor",
  "reviewer",
  "psychologist",
] as const;

export type StarterSkillRole = (typeof STARTER_SKILL_ROLES)[number];

/**
 * Map from M1 roleType strings to the starter-skill role subdirectory.
 * worker/* roles are flattened (worker/explorer → explorer).
 */
export function starterSkillRoleFor(roleType: string): StarterSkillRole | null {
  switch (roleType) {
    case "coordinator":
      return "coordinator";
    case "worker/explorer":
      return "explorer";
    case "worker/planner":
      return "planner";
    case "worker/executor":
      return "executor";
    case "worker/reviewer":
      return "reviewer";
    case "psychologist":
      return "psychologist";
    default:
      return null;
  }
}

export function starterSkillsRoot(): string {
  return path.join(PACKAGE_ROOT, "src", "starter-skills");
}

export function resolveStarterSkillDir(role: StarterSkillRole, skillName: string): string {
  return path.join(starterSkillsRoot(), role, skillName);
}

export function resolveStarterSkillPath(role: StarterSkillRole, skillName: string): string {
  return path.join(resolveStarterSkillDir(role, skillName), "SKILL.md");
}

export interface StarterSkillDescriptor {
  role: StarterSkillRole;
  name: string;
  path: string;
  description: string;
}

export async function listStarterSkillsForRole(
  role: StarterSkillRole,
): Promise<StarterSkillDescriptor[]> {
  const dir = path.join(starterSkillsRoot(), role);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: StarterSkillDescriptor[] = [];
  for (const name of entries.sort()) {
    const skillPath = resolveStarterSkillPath(role, name);
    let text: string;
    try {
      text = await fs.readFile(skillPath, "utf8");
    } catch {
      continue;
    }
    const fm = parseFrontmatter(text) as Record<string, unknown>;
    const description = typeof fm.description === "string" ? fm.description : "";
    out.push({ role, name, path: skillPath, description });
  }
  return out;
}

export async function listAllStarterSkills(): Promise<StarterSkillDescriptor[]> {
  const out: StarterSkillDescriptor[] = [];
  for (const role of STARTER_SKILL_ROLES) {
    out.push(...(await listStarterSkillsForRole(role)));
  }
  return out;
}
