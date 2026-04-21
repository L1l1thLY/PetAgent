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
