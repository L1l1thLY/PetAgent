import * as os from "node:os";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import type { Company } from "@petagent/shared";
import {
  TEMPLATE_NAMES,
  describeTemplate,
  type TemplateName,
} from "@petagent/templates";
import { resolveSecretsStore } from "./secrets.js";
import { parseTemplateSpec, readTemplatePlan } from "./import.js";
import type { Agent } from "@petagent/shared";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

export interface SetupCliOptions extends BaseClientOptions {
  /** Non-interactive name for the new company. */
  companyName?: string;
  /** Non-interactive template choice. Must match a TEMPLATE_NAMES entry. */
  template?: TemplateName;
  /** Non-interactive Anthropic API key; stored in secrets under ANTHROPIC_API_KEY. */
  anthropicApiKey?: string;
  /** Non-interactive sandbox directory (defaults to ./.petagent/sandbox). */
  sandboxDir?: string;
  /** Skip the interactive prompt even if stdin is a TTY. */
  yes?: boolean;
  /** Dry-run: build + print the plan only. */
  dryRun?: boolean;
}

export interface SetupPlan {
  companyName: string;
  template: TemplateName;
  apiKeySecretName: string;
  apiKeyProvided: boolean;
  sandboxDir: string;
}

export function buildSetupPlan(input: {
  companyName?: string | null;
  template?: string | null;
  apiKey?: string | null;
  sandboxDir?: string | null;
}): SetupPlan {
  const rawName = (input.companyName ?? "").trim();
  const companyName = rawName.length > 0 ? rawName : suggestCompanyName();
  const template = normalizeTemplate(input.template);
  const apiKeyProvided = typeof input.apiKey === "string" && input.apiKey.trim().length > 0;
  const sandboxDir =
    (input.sandboxDir ?? "").trim().length > 0
      ? path.resolve((input.sandboxDir ?? "").trim())
      : path.resolve(".petagent", "sandbox");
  return {
    companyName,
    template,
    apiKeySecretName: "ANTHROPIC_API_KEY",
    apiKeyProvided,
    sandboxDir,
  };
}

export function suggestCompanyName(): string {
  const host = os.hostname().split(".")[0] || "team";
  return `${host}-petagent`;
}

function normalizeTemplate(raw: string | null | undefined): TemplateName {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if ((TEMPLATE_NAMES as ReadonlyArray<string>).includes(trimmed)) {
    return trimmed as TemplateName;
  }
  return "solo-pack";
}

export async function renderSetupPreview(plan: SetupPlan): Promise<string> {
  const descriptor = await describeTemplate(plan.template);
  const lines = [
    "",
    pc.bold("PetAgent setup plan"),
    `  Company name:       ${plan.companyName}`,
    `  Starter template:   ${plan.template} — ${descriptor.companyName} (${descriptor.agentCount} agents)`,
    `  Sandbox directory:  ${plan.sandboxDir}`,
    `  ANTHROPIC_API_KEY:  ${plan.apiKeyProvided ? "will be stored in secrets" : pc.dim("not provided (skip)")}`,
    "",
  ];
  return lines.join("\n");
}

export async function ensureSandboxDir(sandboxDir: string): Promise<void> {
  await fs.mkdir(sandboxDir, { recursive: true, mode: 0o700 });
}

async function promptCompanyName(defaultName: string): Promise<string> {
  const answer = await p.text({
    message: "Company name",
    placeholder: defaultName,
    initialValue: defaultName,
  });
  if (p.isCancel(answer)) throw new Error("setup cancelled");
  const trimmed = String(answer).trim();
  return trimmed.length > 0 ? trimmed : defaultName;
}

async function promptTemplate(defaultTemplate: TemplateName): Promise<TemplateName> {
  const descriptors = await Promise.all(
    TEMPLATE_NAMES.map(async (name) => {
      const d = await describeTemplate(name);
      return {
        value: name,
        label: `${d.companyName} — ${d.agentCount} agents`,
        hint: d.description,
      };
    }),
  );
  const answer = await p.select({
    message: "Starter template",
    initialValue: defaultTemplate,
    options: descriptors,
  });
  if (p.isCancel(answer)) throw new Error("setup cancelled");
  return answer as TemplateName;
}

async function promptApiKey(): Promise<string | null> {
  const answer = await p.password({
    message: "Anthropic API key (leave blank to configure later)",
  });
  if (p.isCancel(answer)) throw new Error("setup cancelled");
  const trimmed = String(answer).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function registerSetupCommand(program: Command): void {
  addCommonClientOptions(
    program
      .command("setup")
      .description(
        "Interactive first-run wizard: name your company, pick a starter template, stash your API key, prepare a sandbox, then import the team.",
      )
      .option("--company-name <name>", "Non-interactive company name")
      .option("--template <name>", "Non-interactive template (solo-pack / small-dev-team / hybrid-team)")
      .option("--anthropic-api-key <value>", "Anthropic API key stored under ANTHROPIC_API_KEY")
      .option("--sandbox-dir <path>", "Sandbox directory to create")
      .option("-y, --yes", "Accept defaults and skip prompts", false)
      .option("--dry-run", "Print the plan without making API calls or writing files", false)
      .action(async (opts: SetupCliOptions) => {
        try {
          const interactive =
            !opts.yes && !opts.dryRun && process.stdin.isTTY === true && process.stdout.isTTY === true;
          let plan = buildSetupPlan({
            companyName: opts.companyName,
            template: opts.template,
            apiKey: opts.anthropicApiKey,
            sandboxDir: opts.sandboxDir,
          });

          if (interactive) {
            const companyName = await promptCompanyName(plan.companyName);
            const template = await promptTemplate(plan.template);
            const apiKey = opts.anthropicApiKey ?? (await promptApiKey());
            plan = buildSetupPlan({
              companyName,
              template,
              apiKey,
              sandboxDir: opts.sandboxDir,
            });
          }

          const preview = await renderSetupPreview(plan);
          process.stdout.write(preview);

          if (opts.dryRun) {
            printOutput(plan, { json: Boolean(opts.json) });
            return;
          }

          const ctx = resolveCommandContext(opts, { requireCompany: false });

          // Step 1: create the company.
          const company = await ctx.api.post<Company>("/api/companies", {
            name: plan.companyName,
          });
          if (!company) {
            throw new Error("Server did not return a company record.");
          }
          console.log(`Created company "${company.name}" (${company.id})`);

          // Step 2: sandbox.
          await ensureSandboxDir(plan.sandboxDir);
          console.log(`Sandbox ready at ${plan.sandboxDir}`);

          // Step 3: secrets. Use the same preferred store the secrets CLI
          // commands resolve — keychain-first, encrypted file fallback.
          if (plan.apiKeyProvided && opts.anthropicApiKey) {
            const { store, primaryKind } = await resolveSecretsStore(opts);
            await store.set(plan.apiKeySecretName, opts.anthropicApiKey);
            console.log(
              `Stored ${plan.apiKeySecretName} in ${primaryKind}`,
            );
          }

          // Step 4: import template + hire each agent.
          const spec = parseTemplateSpec(`@petagent/templates/${plan.template}`);
          const templatePlan = await readTemplatePlan(spec);
          for (const hire of templatePlan.hires) {
            const created = await ctx.api.post<Agent>(
              `/api/companies/${company.id}/agents`,
              hire.body,
            );
            if (!created) throw new Error(`agent creation returned null for ${hire.name}`);
            console.log(`hired ${created.name} (${created.id})`);
          }

          console.log("");
          console.log(pc.bold("Setup complete."));
          console.log(`Next: run \`petagent open -C ${company.id}\` to launch the board.`);
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
