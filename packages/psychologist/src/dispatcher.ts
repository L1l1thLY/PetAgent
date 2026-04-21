import type {
  ActiveSeverity,
  AdapterCapabilities,
  PsychologistActions,
} from "./types.js";

export type DispatchKind =
  | "instructions_inject"
  | "instructions_inject_with_comment"
  | "board_comment"
  | "pause_therapy"
  | "split"
  | "no_capability";

export interface DispatchInput {
  targetAgentId: string;
  severity: ActiveSeverity;
  content: string;
  capabilities: AdapterCapabilities;
}

export interface EscalateInput {
  targetAgentId: string;
  reason: string;
  capabilities: AdapterCapabilities;
}

export interface DispatchResult {
  kind: DispatchKind;
  succeeded: boolean;
}

export class InterventionDispatcher {
  constructor(private readonly actions: PsychologistActions) {}

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const { targetAgentId, severity, content, capabilities } = input;

    if (severity === "severe") {
      if (capabilities.supportsIssuePause) {
        await this.actions.pauseIssue(targetAgentId);
        return { kind: "pause_therapy", succeeded: true };
      }
      if (capabilities.supportsBoardComment) {
        await this.actions.postBoardComment(targetAgentId, content);
        return { kind: "board_comment", succeeded: true };
      }
      return { kind: "no_capability", succeeded: false };
    }

    if (capabilities.supportsInstructionsBundle) {
      await this.actions.injectInstructions(targetAgentId, content);
      if (severity === "moderate" && capabilities.supportsBoardComment) {
        await this.actions.postBoardComment(targetAgentId, content);
        return { kind: "instructions_inject_with_comment", succeeded: true };
      }
      return { kind: "instructions_inject", succeeded: true };
    }

    if (capabilities.supportsBoardComment) {
      await this.actions.postBoardComment(targetAgentId, content);
      return { kind: "board_comment", succeeded: true };
    }

    return { kind: "no_capability", succeeded: false };
  }

  async escalate(input: EscalateInput): Promise<DispatchResult> {
    const { targetAgentId, reason, capabilities } = input;
    if (capabilities.supportsIssueSplit) {
      await this.actions.splitIssue(targetAgentId, reason);
      return { kind: "split", succeeded: true };
    }
    if (capabilities.supportsBoardComment) {
      await this.actions.postBoardComment(targetAgentId, reason);
      return { kind: "board_comment", succeeded: true };
    }
    return { kind: "no_capability", succeeded: false };
  }
}
