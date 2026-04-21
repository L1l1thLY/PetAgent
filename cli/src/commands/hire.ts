import type { Command } from "commander";
import type { Agent } from "@petagent/shared";
import {
  generateDefaultName,
  type PluginRole,
} from "@petagent/my-agent-adapter";
import {
  addCommonClientOptions,
  formatInlineRecord,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

export interface HireCliOptions extends BaseClientOptions {
  role: string;
  name?: string;
  title?: string;
  reportsTo?: string;
  budgetUsd?: string | number;
  legacyRole?: string;
  adapterType?: string;
  companyId?: string;
}

export const SUPPORTED_ROLE_TYPES: ReadonlyArray<PluginRole> = [
  "coordinator",
  "worker/explorer",
  "worker/planner",
  "worker/executor",
  "worker/reviewer",
  "psychologist",
];

export interface HirePlan {
  body: Record<string, unknown>;
  pickedName: string;
  roleType: PluginRole;
}

const DEFAULT_LEGACY_ROLE = "general";

export function planHire(
  opts: {
    role: string;
    name?: string;
    title?: string | null;
    reportsTo?: string | null;
    budgetUsd?: number;
    legacyRole?: string;
    adapterType?: string;
  },
  existingAgents: ReadonlyArray<Pick<Agent, "name">>,
): HirePlan {
  const roleType = assertSupportedRoleType(opts.role);
  const pickedName = (opts.name?.trim() || null)
    ?? generateDefaultName(existingAgents.map((a) => a.name), roleType);

  const budgetUsd = Number.isFinite(opts.budgetUsd) ? Number(opts.budgetUsd) : 0;
  if (budgetUsd < 0) {
    throw new Error(`budget must be non-negative, got ${budgetUsd}`);
  }

  const body: Record<string, unknown> = {
    name: pickedName,
    role: (opts.legacyRole?.trim() || DEFAULT_LEGACY_ROLE),
    adapterType: (opts.adapterType?.trim() || "petagent"),
    adapterConfig: { roleType },
    budgetMonthlyCents: Math.round(budgetUsd * 100),
  };
  if (opts.title != null && opts.title.trim().length > 0) body.title = opts.title.trim();
  if (opts.reportsTo != null && opts.reportsTo.trim().length > 0) body.reportsTo = opts.reportsTo.trim();

  return { body, pickedName, roleType };
}

export function assertSupportedRoleType(role: string): PluginRole {
  const normalized = role.trim().toLowerCase();
  for (const known of SUPPORTED_ROLE_TYPES) {
    if (known.toLowerCase() === normalized) return known;
  }
  throw new Error(
    `Unsupported --role "${role}". Expected one of: ${SUPPORTED_ROLE_TYPES.join(", ")}.`,
  );
}

export function registerHireCommand(program: Command): void {
  addCommonClientOptions(
    program
      .command("hire")
      .description(
        "Hire a new agent. --role is the M1 roleType (coordinator / worker/explorer / worker/planner / worker/executor / worker/reviewer / psychologist).",
      )
      .requiredOption("--role <roleType>", "M1 role type")
      .requiredOption("-C, --company-id <id>", "Company ID")
      .option("--name <name>", "Agent display name (auto-generated if omitted)")
      .option("--title <title>", "Optional human-facing title")
      .option("--reports-to <agentId>", "UUID of the manager agent")
      .option("--budget-usd <usd>", "Monthly budget in USD", (v) => Number(v))
      .option(
        "--legacy-role <role>",
        "Paperclip legacy role enum (ceo/cto/engineer/...) — defaults to 'general'",
      )
      .option(
        "--adapter-type <type>",
        "Adapter type override (default: 'petagent')",
      )
      .action(async (opts: HireCliOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const existing =
            (await ctx.api.get<Agent[]>(
              `/api/companies/${ctx.companyId}/agents`,
            )) ?? [];
          const plan = planHire(
            {
              role: opts.role,
              name: opts.name,
              title: opts.title,
              reportsTo: opts.reportsTo,
              budgetUsd: typeof opts.budgetUsd === "string" ? Number(opts.budgetUsd) : opts.budgetUsd,
              legacyRole: opts.legacyRole,
              adapterType: opts.adapterType,
            },
            existing,
          );
          const created = await ctx.api.post<Agent>(
            `/api/companies/${ctx.companyId}/agents`,
            plan.body,
          );
          if (!created) {
            throw new Error("Agent creation returned no response");
          }
          if (ctx.json) {
            printOutput(
              {
                hired: {
                  id: created.id,
                  name: created.name,
                  roleType: plan.roleType,
                  adapterType: created.adapterType,
                },
              },
              { json: true },
            );
            return;
          }
          console.log(
            formatInlineRecord({
              hired: created.name,
              id: created.id,
              roleType: plan.roleType,
              adapterType: created.adapterType,
            }),
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
