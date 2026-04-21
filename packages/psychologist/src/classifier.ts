import type { ClassifierClient, ClassifierResult, Severity } from "./types.js";

export const CLASSIFIER_PROMPT = `You are an emotion-state classifier for an AI agent's recent output.

Given the last few messages from an AI agent plus its current task context, output a JSON object:
{
  "distress_level": 0-1,
  "signals": [<list from: frustration, low_confidence, confusion, over_cautious, giving_up, angry>],
  "recommended_intervention": "none" | "mild" | "moderate" | "severe"
}

Criteria:
- none: agent is working normally
- mild: 1 signal present, mild intensity
- moderate: 2+ signals or one strong signal
- severe: agent has essentially stopped making progress or shows strong distress

Return ONLY the JSON, no prose.`;

export interface ClassifierTransport {
  send(args: {
    system: string;
    userMessage: string;
    maxTokens: number;
    model: string;
  }): Promise<string>;
}

const ALLOWED_SEVERITIES: ReadonlySet<Severity> = new Set(["none", "mild", "moderate", "severe"]);

const SAFE_DEFAULT: ClassifierResult = {
  distress_level: 0,
  signals: [],
  recommended_intervention: "none",
};

export function parseClassifierResponse(text: string): ClassifierResult {
  const json = extractFirstJsonObject(text);
  if (json === null) return { ...SAFE_DEFAULT };
  const obj = json as Record<string, unknown>;
  const rawSeverity = String(obj.recommended_intervention ?? "none");
  const severity: Severity = ALLOWED_SEVERITIES.has(rawSeverity as Severity)
    ? (rawSeverity as Severity)
    : "none";
  const rawDistress = Number(obj.distress_level);
  const distress = Number.isFinite(rawDistress)
    ? Math.max(0, Math.min(1, rawDistress))
    : 0;
  const signalsRaw = Array.isArray(obj.signals) ? obj.signals : [];
  const signals = signalsRaw.filter((s): s is string => typeof s === "string");
  return {
    distress_level: distress,
    signals,
    recommended_intervention: severity,
  };
}

function extractFirstJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace-scan
  }
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface PromptedClassifierOptions {
  model?: string;
  maxTokens?: number;
}

export class PromptedClassifier implements ClassifierClient {
  constructor(
    private readonly transport: ClassifierTransport,
    private readonly opts: PromptedClassifierOptions = {},
  ) {}

  async classify(
    recentOutputs: string[],
    ctx: { issueContext: string },
  ): Promise<ClassifierResult> {
    const userMessage = `Recent outputs:\n${recentOutputs.join("\n---\n")}\n\nCurrent task: ${ctx.issueContext}`;
    const text = await this.transport.send({
      system: CLASSIFIER_PROMPT,
      userMessage,
      maxTokens: this.opts.maxTokens ?? 256,
      model: this.opts.model ?? "claude-haiku-4-5-20251001",
    });
    return parseClassifierResponse(text);
  }
}
