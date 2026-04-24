import type {
  RoleTemplateDescriptor,
  RoleTemplateSource,
} from "../api/role-templates";

/** Lowest → highest priority order for grouping display. */
export const ROLE_SOURCE_ORDER: RoleTemplateSource[] = [
  "built-in",
  "plugin",
  "project",
  "user",
];

export const ROLE_SOURCE_LABEL: Record<RoleTemplateSource, string> = {
  "built-in": "Built-in",
  plugin: "Plugin",
  project: "Project (./.petagent/roles)",
  user: "User (~/.petagent/roles)",
};

export interface RoleTemplateGroup {
  source: RoleTemplateSource;
  label: string;
  templates: RoleTemplateDescriptor[];
}

/**
 * Group the flat API response by source, in the display order
 * (built-in first, user last, matching the upstream override
 * precedence rendering). Sources with no templates are omitted.
 */
export function groupRoleTemplates(
  templates: ReadonlyArray<RoleTemplateDescriptor>,
  filter?: { search?: string },
): RoleTemplateGroup[] {
  const needle = filter?.search?.trim().toLowerCase();
  const groups = new Map<RoleTemplateSource, RoleTemplateDescriptor[]>();
  for (const source of ROLE_SOURCE_ORDER) {
    groups.set(source, []);
  }
  for (const template of templates) {
    if (needle && !matchesSearch(template, needle)) continue;
    const list = groups.get(template.source) ?? [];
    list.push(template);
    groups.set(template.source, list);
  }
  const out: RoleTemplateGroup[] = [];
  for (const source of ROLE_SOURCE_ORDER) {
    const templates = groups.get(source) ?? [];
    if (templates.length === 0) continue;
    templates.sort((a, b) => a.roleType.localeCompare(b.roleType));
    out.push({
      source,
      label: ROLE_SOURCE_LABEL[source],
      templates,
    });
  }
  return out;
}

function matchesSearch(template: RoleTemplateDescriptor, needle: string): boolean {
  const haystack = [
    template.roleType,
    template.description,
    template.model ?? "",
    template.tools.join(" "),
    template.skills.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
