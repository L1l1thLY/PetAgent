// Ported surface from hermes-agent/tools/skill_manager_tool.py (MIT License, Nous Research).
// See NOTICES.md for full attribution.
//
// M1 scope: CRUD + subscription surface backed by GitStore. Full parity with
// Hermes's skill manager tool (trial metrics, auto-archival) lands in M2.

import { GitStore } from "@petagent/safety-net";
import { parseFrontmatter, type ParsedSkill } from "./skill_utils.js";

export type SkillStatus = "trial" | "active" | "retired";

export interface SkillRecord {
  id: string;
  companyId: string;
  ownerAgentId: string | null;
  name: string;
  description: string | null;
  content: string;
  gitCommitSha: string | null;
  status: SkillStatus;
  parsed: ParsedSkill;
}

export interface SkillRepository {
  findById(id: string): Promise<SkillRecord | null>;
  findByCompany(companyId: string): Promise<SkillRecord[]>;
  upsert(record: SkillRecord): Promise<SkillRecord>;
  setStatus(id: string, status: SkillStatus): Promise<void>;
  subscribe(agentId: string, skillId: string): Promise<void>;
  unsubscribe(agentId: string, skillId: string): Promise<void>;
  listSubscriptions(agentId: string): Promise<SkillRecord[]>;
}

export class SkillManager {
  constructor(
    private readonly store: GitStore,
    private readonly repo: SkillRepository,
  ) {}

  async save(
    input: Omit<SkillRecord, "parsed" | "gitCommitSha"> & { content: string },
  ): Promise<SkillRecord> {
    const parsed = parseFrontmatter(input.content);
    const relPath = `skills/${input.companyId}/${input.name}.md`;
    const { sha } = await this.store.writeFile(
      relPath,
      input.content,
      `skill(${input.status}): ${input.name}`,
    );
    const record: SkillRecord = { ...input, parsed, gitCommitSha: sha };
    return this.repo.upsert(record);
  }

  async promote(id: string): Promise<void> {
    await this.repo.setStatus(id, "active");
  }

  async retire(id: string): Promise<void> {
    await this.repo.setStatus(id, "retired");
  }

  async subscribeAgent(agentId: string, skillId: string): Promise<void> {
    await this.repo.subscribe(agentId, skillId);
  }

  async listForAgent(agentId: string): Promise<SkillRecord[]> {
    return this.repo.listSubscriptions(agentId);
  }
}
