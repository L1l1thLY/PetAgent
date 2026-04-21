import type {
  BehavioralRecordsStore,
  BehavioralSignal,
  RunSummary,
  Severity,
} from "./types.js";

const RUN_HISTORY_DEPTH = 5;
const OUTPUT_HISTORY_DEPTH = 20;
const TOOL_HISTORY_DEPTH = 10;

const CONSECUTIVE_FAIL_THRESHOLD = 3;
const TOOL_ERROR_RATE_THRESHOLD = 0.5;
const TOOL_MIN_SAMPLES = 5;
const OUTPUT_MIN_SAMPLES = 10;
const OUTPUT_RECENT_WINDOW = 3;
const OUTPUT_DROP_SIGMA = 2;

export class BehaviorMonitor {
  constructor(private readonly store: BehavioralRecordsStore) {}

  async check(agentId: string): Promise<BehavioralSignal> {
    const signals: string[] = [];
    const details: Record<string, unknown> = {};

    const runs = await this.store.recentRuns(agentId, RUN_HISTORY_DEPTH);
    const consecutiveFails = countConsecutiveFails(runs);
    if (consecutiveFails >= CONSECUTIVE_FAIL_THRESHOLD) {
      signals.push("consecutive_failures");
      details.consecutiveFails = consecutiveFails;
    }

    const lengths = await this.store.recentOutputLengths(agentId, OUTPUT_HISTORY_DEPTH);
    if (isCollapse(lengths)) {
      signals.push("output_length_drop");
      details.lengthTrend = lengths.slice(-5);
    }

    const toolCalls = await this.store.recentToolCalls(agentId, TOOL_HISTORY_DEPTH);
    if (toolCalls.length >= TOOL_MIN_SAMPLES) {
      const errors = toolCalls.filter((c) => !c.succeeded).length;
      const rate = errors / toolCalls.length;
      if (rate > TOOL_ERROR_RATE_THRESHOLD) {
        signals.push("tool_error_rate_high");
        details.toolErrorRate = rate;
      }
    }

    return {
      agentId,
      behavioralSeverity: severityFor(signals.length),
      signals,
      details,
    };
  }
}

function countConsecutiveFails(rows: RunSummary[]): number {
  let count = 0;
  for (const row of rows) {
    if (row.status === "failed") count += 1;
    else break;
  }
  return count;
}

function isCollapse(values: number[]): boolean {
  if (values.length < OUTPUT_MIN_SAMPLES) return false;
  const baseline = values.slice(0, values.length - OUTPUT_RECENT_WINDOW);
  if (baseline.length < OUTPUT_MIN_SAMPLES - OUTPUT_RECENT_WINDOW) return false;
  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const variance =
    baseline.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / baseline.length;
  const std = Math.sqrt(variance);
  if (std === 0) return false;
  const recent = values.slice(-OUTPUT_RECENT_WINDOW);
  return recent.every((v) => v < mean - OUTPUT_DROP_SIGMA * std);
}

function severityFor(signalCount: number): Severity {
  if (signalCount === 0) return "none";
  if (signalCount === 1) return "mild";
  if (signalCount === 2) return "moderate";
  return "severe";
}
