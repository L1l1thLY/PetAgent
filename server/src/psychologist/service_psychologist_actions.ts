/**
 * Concrete `PsychologistActions` impl (#1d, spec §7.3).
 *
 * Calls into the existing service layer (`issueService`,
 * `agentInstructionsService`) rather than touching drizzle directly so
 * the side effects route handlers depend on (status-transition
 * validation, redaction, live-event emission, NotificationStore bridge)
 * keep working when the Psychologist intervenes.
 *
 * All four methods catch their errors and never throw — the dispatcher
 * already records `succeeded: boolean` on the incident, and a thrown
 * error in here would orphan that incident write upstream in
 * Psychologist.onEvent.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@petagent/db";
import { agents, issues } from "@petagent/db";
import type { PsychologistActions } from "@petagent/psychologist";

const DEFAULT_INJECTION_FILENAME = "psychologist-injection.md";
const DEFAULT_PAUSE_MESSAGE = "Paused for therapy session.";
const DEFAULT_SPLIT_TEMPLATE = (childIdentifier: string, reason: string): string =>
  `Recommended split into ${childIdentifier}: ${reason}`;

type Logger = { warn(msg: string, meta?: unknown): void };

interface AgentRow {
  id: string;
  companyId: string;
  name: string;
  adapterConfig: unknown;
}

interface ActiveIssueRow {
  id: string;
  companyId: string;
  projectId: string | null;
  goalId: string | null;
}

interface FakeableIssueService {
  addComment(
    issueId: string,
    body: string,
    actor: { agentId?: string; userId?: string; runId?: string | null },
  ): Promise<unknown>;
  update(
    id: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  create(
    companyId: string,
    data: {
      title: string;
      description?: string;
      parentId?: string;
      projectId?: string | null;
      goalId?: string | null;
      status?: string;
    },
  ): Promise<{ id: string; identifier?: string }>;
}

interface FakeableAgentInstructions {
  writeFile(
    agent: AgentRow,
    relativePath: string,
    content: string,
  ): Promise<unknown>;
}

export interface ServicePsychologistActionsDeps {
  db: Db;
  issueService: FakeableIssueService;
  agentInstructions: FakeableAgentInstructions;
  systemActorAgentId?: string | null;
  injectionFileName?: string;
  pauseAuditMessage?: string;
  splitAuditMessageTemplate?: (childIdentifier: string, reason: string) => string;
  logger?: Logger;
}

export class ServicePsychologistActions implements PsychologistActions {
  private readonly db: Db;
  private readonly issueService: FakeableIssueService;
  private readonly agentInstructions: FakeableAgentInstructions;
  private readonly systemActorAgentId: string | null;
  private readonly injectionFileName: string;
  private readonly pauseAuditMessage: string;
  private readonly splitAuditMessageTemplate: (childIdentifier: string, reason: string) => string;
  private readonly logger: Logger;

  constructor(deps: ServicePsychologistActionsDeps) {
    this.db = deps.db;
    this.issueService = deps.issueService;
    this.agentInstructions = deps.agentInstructions;
    this.systemActorAgentId = deps.systemActorAgentId ?? null;
    this.injectionFileName = deps.injectionFileName ?? DEFAULT_INJECTION_FILENAME;
    this.pauseAuditMessage = deps.pauseAuditMessage ?? DEFAULT_PAUSE_MESSAGE;
    this.splitAuditMessageTemplate = deps.splitAuditMessageTemplate ?? DEFAULT_SPLIT_TEMPLATE;
    this.logger = deps.logger ?? { warn: () => {} };
  }

  async injectInstructions(agentId: string, content: string): Promise<void> {
    try {
      const agent = await this.findAgent(agentId);
      if (!agent) {
        this.logger.warn("psychologist.injectInstructions: agent not found", { agentId });
        return;
      }
      await this.agentInstructions.writeFile(agent, this.injectionFileName, content);
    } catch (err) {
      this.logger.warn("psychologist.injectInstructions failed", { agentId, err: String(err) });
    }
  }

  async postBoardComment(agentId: string, content: string): Promise<void> {
    try {
      const issue = await this.findActiveIssue(agentId);
      if (!issue) {
        this.logger.warn("psychologist.postBoardComment: no active issue", { agentId });
        return;
      }
      await this.issueService.addComment(issue.id, content, this.actorForComment());
    } catch (err) {
      this.logger.warn("psychologist.postBoardComment failed", { agentId, err: String(err) });
    }
  }

  async pauseIssue(agentId: string): Promise<void> {
    try {
      const issue = await this.findActiveIssue(agentId);
      if (!issue) {
        this.logger.warn("psychologist.pauseIssue: no active issue", { agentId });
        return;
      }
      let transitioned = false;
      try {
        await this.issueService.update(issue.id, {
          status: "blocked",
          actorAgentId: this.systemActorAgentId,
        });
        transitioned = true;
      } catch (err) {
        this.logger.warn("psychologist.pauseIssue: status transition rejected, degrading to comment-only", {
          agentId,
          issueId: issue.id,
          err: String(err),
        });
      }
      try {
        await this.issueService.addComment(issue.id, this.pauseAuditMessage, this.actorForComment());
      } catch (err) {
        this.logger.warn("psychologist.pauseIssue: audit comment failed", {
          agentId,
          issueId: issue.id,
          transitioned,
          err: String(err),
        });
      }
    } catch (err) {
      this.logger.warn("psychologist.pauseIssue failed", { agentId, err: String(err) });
    }
  }

  async splitIssue(agentId: string, reason: string): Promise<void> {
    try {
      const parent = await this.findActiveIssue(agentId);
      if (!parent) {
        this.logger.warn("psychologist.splitIssue: no active issue", { agentId });
        return;
      }
      const title = reason.length > 120 ? reason.slice(0, 120) : reason;
      const child = await this.issueService.create(parent.companyId, {
        title,
        description: reason,
        parentId: parent.id,
        projectId: parent.projectId,
        goalId: parent.goalId,
        status: "todo",
      });
      const childIdentifier = child.identifier ?? child.id;
      try {
        await this.issueService.addComment(
          parent.id,
          this.splitAuditMessageTemplate(childIdentifier, reason),
          this.actorForComment(),
        );
      } catch (err) {
        this.logger.warn("psychologist.splitIssue: audit comment failed", {
          agentId,
          parentIssueId: parent.id,
          childIssueId: child.id,
          err: String(err),
        });
      }
    } catch (err) {
      this.logger.warn("psychologist.splitIssue failed", { agentId, err: String(err) });
    }
  }

  private async findAgent(agentId: string): Promise<AgentRow | null> {
    const rows = await this.db
      .select({
        id: agents.id,
        companyId: agents.companyId,
        name: agents.name,
        adapterConfig: agents.adapterConfig,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    return (rows[0] as AgentRow | undefined) ?? null;
  }

  private async findActiveIssue(agentId: string): Promise<ActiveIssueRow | null> {
    const rows = await this.db
      .select({
        id: issues.id,
        companyId: issues.companyId,
        projectId: issues.projectId,
        goalId: issues.goalId,
      })
      .from(issues)
      .where(and(eq(issues.assigneeAgentId, agentId), eq(issues.status, "in_progress")))
      .orderBy(desc(issues.updatedAt))
      .limit(1);
    return (rows[0] as ActiveIssueRow | undefined) ?? null;
  }

  protected actorForComment(): { agentId?: string; userId?: string; runId: null } {
    if (this.systemActorAgentId) return { agentId: this.systemActorAgentId, runId: null };
    return { runId: null };
  }
}
