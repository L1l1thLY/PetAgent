import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import type { Agent } from "@petagent/shared";
import {
  TEMPLATE_NAMES,
  resolveTemplateRoot,
  parseFrontmatter,
  listAgentDirs,
  type TemplateName,
} from "@petagent/templates";
import * as yaml from "js-yaml";
import { planHire } from "./hire.js";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

export interface ImportCliOptions extends BaseClientOptions {
  companyId?: string;
  /** Skip the final POST; print the plan only. */
  dryRun?: boolean;
}

export type ImportSource =
  | { kind: "builtin"; name: TemplateName; root: string }
  | { kind: "local_dir"; root: string }
  | { kind: "github"; url: string };

const BUILTIN_PREFIX = "@petagent/templates/";

export function parseTemplateSpec(spec: string): ImportSource {
  const trimmed = spec.trim();
  if (trimmed.length === 0) {
    throw new Error("template spec must not be empty");
  }
  if (trimmed.startsWith(BUILTIN_PREFIX)) {
    const name = trimmed.slice(BUILTIN_PREFIX.length) as TemplateName;
    if (!(TEMPLATE_NAMES as ReadonlyArray<string>).includes(name)) {
      throw new Error(
        `unknown built-in template "${name}". Available: ${TEMPLATE_NAMES.join(", ")}`,
      );
    }
    return { kind: "builtin", name, root: resolveTemplateRoot(name) };
  }
  if (trimmed.startsWith("github:")) {
    return { kind: "github", url: trimmed };
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { kind: "github", url: trimmed };
  }
  return { kind: "local_dir", root: path.resolve(trimmed) };
}

interface PetAgentYamlAgentEntry {
  adapter?: { type?: string; config?: Record<string, unknown> };
  budget?: { monthlyUsd?: number };
}

interface PetAgentYamlShape {
  schema?: string;
  agents?: Record<string, PetAgentYamlAgentEntry>;
}

export interface PlannedHire {
  name: string;
  title: string;
  reportsTo: string | null;
  body: Record<string, unknown>;
}

export interface ImportPlan {
  companyName: string;
  companySlug: string;
  hires: PlannedHire[];
}

export async function readTemplatePlan(
  source: ImportSource,
): Promise<ImportPlan> {
  if (source.kind === "github") {
    throw new Error(
      `GitHub template import is a V1 stub. Clone the repo locally then run: petagent import <path>`,
    );
  }
  const root = source.root;
  const companyMdPath = path.join(root, "COMPANY.md");
  const companyText = await fs.readFile(companyMdPath, "utf8").catch((err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Template ${root} is missing COMPANY.md — is this an agentcompanies/v1 package?`,
      );
    }
    throw err;
  });
  const companyFm = parseFrontmatter(companyText) as Record<string, unknown>;
  const companyName = stringField(companyFm, "name", path.basename(root));
  const companySlug = stringField(companyFm, "slug", path.basename(root));

  const petagentYaml = await readOptionalPetAgentYaml(root);

  const agentDirs = await listAgentDirs(root);
  const hires: PlannedHire[] = [];
  for (const slug of agentDirs) {
    const agentMd = await fs.readFile(
      path.join(root, "agents", slug, "AGENTS.md"),
      "utf8",
    );
    const fm = parseFrontmatter(agentMd) as Record<string, unknown>;
    const displayName = stringField(fm, "name", slug);
    const title = stringField(fm, "title", "");
    const reportsToRaw = fm.reportsTo;
    const reportsTo =
      typeof reportsToRaw === "string" && reportsToRaw.length > 0
        ? reportsToRaw
        : null;
    const pet = petagentYaml?.agents?.[slug] ?? {};
    const adapterType = pet.adapter?.type ?? "petagent";
    const roleType = String(pet.adapter?.config?.roleType ?? "");
    if (roleType.length === 0) {
      throw new Error(
        `Agent "${slug}" has no roleType declared in .petagent.yaml — cannot hire.`,
      );
    }
    const plan = planHire(
      {
        role: roleType,
        name: displayName,
        title: title.length > 0 ? title : undefined,
        budgetUsd: typeof pet.budget?.monthlyUsd === "number" ? pet.budget.monthlyUsd : 0,
        adapterType,
      },
      [],
    );
    hires.push({
      name: plan.pickedName,
      title,
      reportsTo,
      body: plan.body,
    });
  }
  return { companyName, companySlug, hires };
}

async function readOptionalPetAgentYaml(
  root: string,
): Promise<PetAgentYamlShape | null> {
  for (const name of [".petagent.yaml", ".petagent.yml"]) {
    const p = path.join(root, name);
    try {
      const raw = await fs.readFile(p, "utf8");
      const parsed = yaml.load(raw) as PetAgentYamlShape | null | undefined;
      if (parsed && typeof parsed === "object") return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return null;
}

function stringField(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}

/**
 * Resolve a reportsTo slug → agentId after the agents have been created.
 * Second-pass is required because AGENTS.md references sibling slugs that
 * only become UUIDs once the POST returns.
 */
export function resolveReportsToMap(
  hires: PlannedHire[],
  created: Array<{ slug: string; id: string }>,
): Array<{ slug: string; reportsToId: string | null }> {
  const bySlug = new Map(created.map((c) => [c.slug, c.id]));
  return hires.map((h, idx) => ({
    slug: created[idx].slug,
    reportsToId: h.reportsTo ? bySlug.get(h.reportsTo) ?? null : null,
  }));
}

export function registerImportCommand(program: Command): void {
  addCommonClientOptions(
    program
      .command("import <template>")
      .description(
        "Import an agentcompanies/v1 template and hire every declared agent. " +
          "Built-in: @petagent/templates/{solo-pack,small-dev-team,hybrid-team}. " +
          "Local path: ./my-team. github:owner/repo/path is a V1 stub.",
      )
      .requiredOption("-C, --company-id <id>", "Target company ID")
      .option("--dry-run", "Parse + plan only; no POSTs", false)
      .action(async (templateSpec: string, opts: ImportCliOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const source = parseTemplateSpec(templateSpec);
          const plan = await readTemplatePlan(source);

          if (opts.dryRun) {
            printOutput(
              {
                source,
                companyName: plan.companyName,
                companySlug: plan.companySlug,
                hires: plan.hires.map((h) => ({
                  name: h.name,
                  title: h.title,
                  reportsTo: h.reportsTo,
                  adapterType: h.body.adapterType,
                  roleType: (h.body.adapterConfig as { roleType?: string } | undefined)?.roleType,
                })),
              },
              { json: Boolean(ctx.json) },
            );
            return;
          }

          const created: Array<{ slug: string; id: string; name: string }> = [];
          for (const hire of plan.hires) {
            const response = await ctx.api.post<Agent>(
              `/api/companies/${ctx.companyId}/agents`,
              hire.body,
            );
            if (!response) {
              throw new Error(`agent creation returned null for ${hire.name}`);
            }
            created.push({
              slug: hire.reportsTo ? hire.reportsTo : hire.name, // map key is the slug-like name
              id: response.id,
              name: response.name,
            });
            console.log(`hired ${response.name} (${response.id})`);
          }
          console.log(
            `Imported template "${plan.companyName}" (${plan.companySlug}) — ${created.length} agents.`,
          );
          console.log(
            `Note: reportsTo links between newly-created agents are not yet wired automatically; update them via \`petagent agent ...\` if your template declares them.`,
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
