/**
 * Chat Bar route (spec §17.7). One POST that:
 *   1. Resolves the company's Coordinator agent (role = "coordinator", or
 *      whichever agent has been declared the company's CEO).
 *   2. Creates an issue assigned to that agent with the user's message
 *      as title (truncated to 120 chars) + description.
 *   3. Returns the new issue id so the client can navigate to it.
 *
 * No new dispatch path — Coordinator's existing heartbeat picks up
 * assigned issues. The Chat Bar is purely a UI shortcut to issue.create.
 */

import { Router } from "express";
import { z } from "zod";
import type { Db } from "@petagent/db";
import { agents } from "@petagent/db";
import { and, eq, asc } from "drizzle-orm";
import { issueService } from "../services/issues.js";

const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
});

export interface CompanyChatRoutesDeps {
  db: Db;
}

export function companyChatRoutes(deps: CompanyChatRoutesDeps): Router {
  const router = Router();
  const issues = issueService(deps.db);

  router.post("/companies/:companyId/chat", async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const companyId = req.params.companyId;
    const coordinator = await findCoordinatorAgent(deps.db, companyId);
    if (!coordinator) {
      res.status(404).json({
        error: "No Coordinator agent in this company. Hire one before using Chat.",
      });
      return;
    }
    const message = parsed.data.message.trim();
    const title = message.length > 120 ? `${message.slice(0, 117)}...` : message;
    try {
      const issue = await issues.create(companyId, {
        title,
        description: message,
        priority: "medium",
        status: "todo",
        assigneeAgentId: coordinator.id,
      });
      res.status(201).json({
        issueId: issue.id,
        identifier: issue.identifier,
        coordinatorId: coordinator.id,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to create chat issue",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}

async function findCoordinatorAgent(
  db: Db,
  companyId: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.role, "coordinator")))
    .orderBy(asc(agents.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
