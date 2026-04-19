import { scanForThreats, type ThreatMatch } from "./threat_patterns.js";

export type ValidationDecision = "allow" | "review" | "block";

export interface ValidationInput {
  text: string;
  context?: {
    agentId?: string;
    issueId?: string;
    purpose?: "code" | "comment" | "plan" | "other";
  };
}

export interface ValidationResult {
  decision: ValidationDecision;
  threats: ThreatMatch[];
  reasoning: string;
}

export interface LLMValidator {
  classify(input: ValidationInput, regexThreats: ThreatMatch[]): Promise<ValidationResult>;
}

/**
 * Regex-only validator. Used when no LLM validator is configured.
 *
 * Rules:
 * - Any `invisible_unicode` match → block (never legitimate in agent text).
 * - Any other threat match → review (human or LLM layer decides).
 * - No matches → allow.
 */
export function validateWithRegexOnly(input: ValidationInput): ValidationResult {
  const threats = scanForThreats(input.text);
  if (threats.length === 0) {
    return { decision: "allow", threats, reasoning: "no threat patterns matched" };
  }
  if (threats.some((t) => t.category === "invisible_unicode")) {
    return {
      decision: "block",
      threats,
      reasoning: "invisible unicode chars in agent output",
    };
  }
  return {
    decision: "review",
    threats,
    reasoning: `${threats.length} pattern(s) matched: ${threats.map((t) => t.patternId).join(", ")}`,
  };
}

/**
 * Two-layer validator: regex first, then LLM if the regex layer returns
 * "review". Allow/block short-circuits; LLM only sees the borderline cases.
 */
export async function validateWithLLM(
  input: ValidationInput,
  llm: LLMValidator,
): Promise<ValidationResult> {
  const regex = validateWithRegexOnly(input);
  if (regex.decision !== "review") return regex;
  return llm.classify(input, regex.threats);
}
