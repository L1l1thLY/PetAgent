import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { RoleTemplateSchema, type RoleTemplate, type RoleSource } from "./schema.js";

export interface LoaderOptions {
  userDir: string;
  projectDir: string;
  pluginDirs: string[];
  builtInDir: string;
}

export interface LoadResult {
  template: RoleTemplate;
  source: RoleSource;
  path: string;
}

const LOW_TO_HIGH: RoleSource[] = ["built-in", "plugin", "project", "user"];

export class RoleTemplateLoader {
  constructor(private readonly opts: LoaderOptions) {}

  async loadAll(): Promise<LoadResult[]> {
    const byName = new Map<string, LoadResult>();
    for (const source of LOW_TO_HIGH) {
      const dirs = this.dirsFor(source);
      for (const dir of dirs) {
        const loaded = await this.loadFromDir(dir, source);
        for (const entry of loaded) {
          byName.set(entry.template.roleType, entry);
        }
      }
    }
    return Array.from(byName.values());
  }

  private dirsFor(source: RoleSource): string[] {
    switch (source) {
      case "user":
        return [this.opts.userDir];
      case "project":
        return [this.opts.projectDir];
      case "plugin":
        return this.opts.pluginDirs;
      case "built-in":
        return [this.opts.builtInDir];
    }
  }

  private async loadFromDir(dir: string, source: RoleSource): Promise<LoadResult[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const results: LoadResult[] = [];
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const filePath = path.join(dir, name);
      try {
        const content = await fs.readFile(filePath, "utf8");
        const template = parseRoleMarkdown(content);
        if (!template) continue;
        results.push({ template, source, path: filePath });
      } catch (err) {
        console.error(`[role-template] failed to load ${filePath}:`, err);
      }
    }
    return results;
  }
}

export function parseRoleMarkdown(content: string): RoleTemplate | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const fm = yaml.load(match[1]);
  const body = match[2] ?? "";
  if (!fm || typeof fm !== "object") return null;
  const candidate = { ...(fm as Record<string, unknown>), prompt: body.trim() };
  const parsed = RoleTemplateSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`role template schema invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}
