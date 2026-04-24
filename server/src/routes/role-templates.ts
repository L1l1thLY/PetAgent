/**
 * Read-only listing of role templates (spec §17.3 / §3.10).
 *
 * Returns every role template discovered via the RoleTemplateLoader,
 * annotated with the source it came from (user > project > plugin >
 * built-in). The Roles UI (/roles) renders this list grouped by source.
 *
 * Write paths (edit role YAML, reload from disk) are out of scope —
 * they need the FS watcher + file-permission UX the plan lists as V2
 * territory. For V1 we ship the read surface; the RoleTemplateLoader
 * + watcher plumbing (Task 58) handles change detection at the server
 * layer, and operators edit role markdown directly on disk.
 */

import { Router } from "express";
import { RoleTemplateLoader } from "@petagent/role-template";

export interface RoleTemplatesRouteOptions {
  /**
   * Factory that returns the loader. Injected so tests can pass a
   * tiny in-memory stand-in without spinning up a fs directory graph.
   */
  loaderFactory: () => RoleTemplateLoader;
}

export function roleTemplatesRoutes(opts: RoleTemplatesRouteOptions) {
  const router = Router();
  const loader = opts.loaderFactory();

  router.get("/role-templates", async (_req, res) => {
    const loaded = await loader.loadAll();
    res.json(
      loaded.map((entry) => ({
        roleType: entry.template.roleType,
        description: entry.template.description,
        promptPreview: takeFirstLines(entry.template.prompt, 5),
        tools: entry.template.tools ?? [],
        disallowedTools: entry.template.disallowedTools ?? [],
        mcpServers: entry.template.mcpServers ?? [],
        model: entry.template.model ?? null,
        isolation: entry.template.isolation,
        background: entry.template.background ?? false,
        skills: entry.template.skills ?? [],
        source: entry.source,
        path: entry.path,
      })),
    );
  });

  return router;
}

export function takeFirstLines(text: string, n: number): string {
  const lines = text.split("\n");
  return lines.slice(0, n).join("\n");
}
