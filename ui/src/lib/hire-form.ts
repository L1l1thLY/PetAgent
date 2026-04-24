import type { RoleTemplateDescriptor } from "../api/role-templates";

/**
 * HireDialog form state — the shape the <HireDialog/> component uses
 * internally. Kept as a pure interface + helpers so the validation /
 * payload-build logic doesn't require rendering the component.
 */
export interface HireFormState {
  name: string;
  title: string;
  legacyRole: string;
  adapterType: string;
  roleType: string;
  model: string;
  budgetUsd: string;
  isolation: "none" | "worktree" | "remote";
  reportsTo: string;
  skills: string;
}

export const DEFAULT_LEGACY_ROLE = "general";
export const DEFAULT_ADAPTER_TYPE = "petagent";

export function buildHireFormDefaults(template: RoleTemplateDescriptor): HireFormState {
  return {
    name: "",
    title: "",
    legacyRole: DEFAULT_LEGACY_ROLE,
    adapterType: DEFAULT_ADAPTER_TYPE,
    roleType: template.roleType,
    model: template.model ?? "",
    budgetUsd: "0",
    isolation: template.isolation,
    reportsTo: "",
    skills: (template.skills ?? []).join(", "),
  };
}

export interface HireFormErrors {
  name?: string;
  budgetUsd?: string;
  roleType?: string;
  adapterType?: string;
}

export function validateHireForm(state: HireFormState): HireFormErrors {
  const errors: HireFormErrors = {};
  if (state.name.trim().length === 0) {
    errors.name = "Name is required";
  }
  if (state.roleType.trim().length === 0) {
    errors.roleType = "Role type is required";
  }
  if (state.adapterType.trim().length === 0) {
    errors.adapterType = "Adapter type is required";
  }
  const budget = Number(state.budgetUsd);
  if (!Number.isFinite(budget) || budget < 0) {
    errors.budgetUsd = "Monthly budget must be a non-negative number";
  }
  return errors;
}

export function hasErrors(errors: HireFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Build the POST /api/companies/:id/agents body from a validated form
 * state. Mirrors planHire() in the CLI for shape consistency.
 */
export function buildHirePayload(state: HireFormState): Record<string, unknown> {
  const skills = state.skills
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const budget = Number(state.budgetUsd);
  const payload: Record<string, unknown> = {
    name: state.name.trim(),
    role: state.legacyRole.trim() || DEFAULT_LEGACY_ROLE,
    adapterType: state.adapterType.trim(),
    adapterConfig: { roleType: state.roleType.trim() },
    budgetMonthlyCents: Math.round(budget * 100),
  };
  if (state.title.trim().length > 0) payload.title = state.title.trim();
  if (state.reportsTo.trim().length > 0) payload.reportsTo = state.reportsTo.trim();
  if (skills.length > 0) payload.desiredSkills = skills;
  if (state.model.trim().length > 0) {
    (payload.adapterConfig as Record<string, unknown>).model = state.model.trim();
  }
  return payload;
}

/**
 * Drag-and-drop payload produced when a role card is dragged from the
 * RolePanel. We stash only the roleType (not the whole template) to
 * avoid shipping large JSON through DataTransfer.
 */
export const DRAG_TYPE_ROLE = "application/x-petagent-role";

export function encodeDragRoleType(roleType: string): string {
  return roleType;
}

export function decodeDragRoleType(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
