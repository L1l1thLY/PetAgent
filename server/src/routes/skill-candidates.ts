/**
 * Skill candidates REST surface (M2 G4 MVP).
 *
 *   GET    /companies/:companyId/skill-candidates?status=pending
 *   POST   /companies/:companyId/skill-candidates/:id/approve
 *   POST   /companies/:companyId/skill-candidates/:id/reject
 *   POST   /companies/:companyId/skill-mining/run-now
 *
 * Approve creates a real Skill via SkillManager (status=trial) and
 * marks the candidate as promoted with promotedSkillName populated.
 * Reject is a one-shot status flip.
 *
 * The run-now button kicks off mineForCompany() inline. Returns the
 * MineCycleResult so the UI can surface "0 candidates created" or
 * "skipped — LLM not configured" without a follow-up GET.
 */

import { Router, type Request } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Db } from "@petagent/db";
import { GitStore } from "@petagent/safety-net";
import { SkillManager, type SkillRepository } from "@petagent/skills";
import { SkillCandidatesRepo } from "../skill-miner/repo.js";
import { mineForCompany, type SkillMinerRunnerDeps } from "../skill-miner/runner.js";
import { assertBoardOrgAccess, getActorInfo } from "./authz.js";
import { forbidden, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "promoted"]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const runNowSchema = z.object({
  windowDays: z.coerce.number().int().positive().max(90).optional(),
});

export interface SkillCandidatesRoutesDeps {
  db: Db;
  skillRepo: SkillRepository;
  notesGitStoreDir: string;
  runnerDeps: SkillMinerRunnerDeps;
}

function assertCanReview(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
}

export function skillCandidatesRoutes(deps: SkillCandidatesRoutesDeps): Router {
  const router = Router();
  const repo = new SkillCandidatesRepo(deps.db);
  const store = new GitStore({ rootDir: deps.notesGitStoreDir });
  let storeInited = false;
  async function ensureStoreInit() {
    if (!storeInited) {
      await store.init();
      storeInited = true;
    }
  }

  router.get("/companies/:companyId/skill-candidates", async (req, res) => {
    assertBoardOrgAccess(req);
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
      return;
    }
    const items = await repo.listByCompany({
      companyId: req.params.companyId,
      status: parsed.data.status,
      limit: parsed.data.limit,
    });
    res.json({ items, total: items.length });
  });

  router.post(
    "/companies/:companyId/skill-candidates/:id/approve",
    async (req, res) => {
      assertCanReview(req);
      const candidate = await repo.findById(req.params.id);
      if (candidate === null || candidate.companyId !== req.params.companyId) {
        throw notFound("Skill candidate not found");
      }
      if (candidate.status !== "pending") {
        res.status(409).json({ error: `Candidate already ${candidate.status}` });
        return;
      }

      await ensureStoreInit();
      const skillManager = new SkillManager(store, deps.skillRepo);
      const skillId = randomUUID();
      const skill = await skillManager.save({
        id: skillId,
        companyId: candidate.companyId,
        ownerAgentId: candidate.agentId,
        name: candidate.name,
        description: candidate.title,
        content: buildSkillContent(candidate.body, candidate.title, candidate.rationale ?? ""),
        status: "trial",
      });

      const actor = getActorInfo(req);
      const updated = await repo.setStatus({
        id: candidate.id,
        status: "promoted",
        reviewedByActorId: actor.actorId,
        promotedSkillName: skill.name,
      });

      res.json({ candidate: updated, skill: { id: skill.id, name: skill.name } });
    },
  );

  router.post(
    "/companies/:companyId/skill-candidates/:id/reject",
    async (req, res) => {
      assertCanReview(req);
      const candidate = await repo.findById(req.params.id);
      if (candidate === null || candidate.companyId !== req.params.companyId) {
        throw notFound("Skill candidate not found");
      }
      if (candidate.status !== "pending") {
        res.status(409).json({ error: `Candidate already ${candidate.status}` });
        return;
      }
      const actor = getActorInfo(req);
      const updated = await repo.setStatus({
        id: candidate.id,
        status: "rejected",
        reviewedByActorId: actor.actorId,
      });
      res.json({ candidate: updated });
    },
  );

  router.post(
    "/companies/:companyId/skill-mining/run-now",
    validate(runNowSchema),
    async (req, res) => {
      assertCanReview(req);
      const overrides: SkillMinerRunnerDeps = {
        ...deps.runnerDeps,
        ...(req.body.windowDays !== undefined ? { windowDays: req.body.windowDays } : {}),
      };
      const result = await mineForCompany(overrides, String(req.params.companyId));
      res.json(result);
    },
  );

  return router;
}

function buildSkillContent(body: string, title: string, rationale: string): string {
  const fm = `---\nname: ${escapeYamlString(title)}\nsource: skill-miner\n${rationale ? `rationale: ${escapeYamlString(rationale)}\n` : ""}---\n\n`;
  return fm + body;
}

function escapeYamlString(s: string): string {
  // Simple safe quoting — wrap in double quotes and escape backslash + quote.
  const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}
