// Ported from hermes-agent/tools/fuzzy_match.py (MIT License, Nous Research).
// See NOTICES.md for full attribution.
//
// 9-strategy chain for fuzzy find-and-replace in LLM-generated file edits.
// M1 scope: strategies 1-5 implemented; 6-9 stubs to land in a follow-up PR.

export type FuzzyStrategy =
  | "exact"
  | "line_trimmed"
  | "whitespace_normalized"
  | "indentation_flexible"
  | "escape_normalized"
  | "trimmed_boundary"
  | "block_anchor"
  | "context_aware"
  | "unicode_normalized";

export interface FuzzyMatchResult {
  content: string;
  matchCount: number;
  strategy: FuzzyStrategy | null;
  error: string | null;
}

const UNICODE_MAP: Record<string, string> = {
  "\u201c": '"',
  "\u201d": '"',
  "\u2018": "'",
  "\u2019": "'",
  "\u2014": "--",
  "\u2013": "-",
  "\u2026": "...",
  "\u00a0": " ",
};

export function unicodeNormalize(text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(UNICODE_MAP)) {
    out = out.split(from).join(to);
  }
  return out;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let n = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    n += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return n;
}

function exactStrategy(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): FuzzyMatchResult | null {
  const count = countOccurrences(content, oldStr);
  if (count === 0) return null;
  if (!replaceAll && count > 1) {
    return {
      content,
      matchCount: count,
      strategy: "exact",
      error: `old_string matched ${count} times; pass replace_all or add context to make it unique`,
    };
  }
  const replaced = replaceAll
    ? content.split(oldStr).join(newStr)
    : content.replace(oldStr, newStr);
  return { content: replaced, matchCount: count, strategy: "exact", error: null };
}

function lineTrimmedStrategy(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): FuzzyMatchResult | null {
  const trim = (s: string) =>
    s.split("\n").map((line) => line.trim()).join("\n");
  const trimmedOld = trim(oldStr);
  const trimmedContent = trim(content);
  // Nothing to gain if neither side changes under trimming AND the needle
  // didn't match in exact strategy (we wouldn't have been called if it did).
  if (trimmedOld === oldStr && trimmedContent === content) return null;
  if (!trimmedContent.includes(trimmedOld)) return null;
  const result = exactStrategy(trimmedContent, trimmedOld, newStr, replaceAll);
  if (!result) return null;
  return { ...result, strategy: "line_trimmed" };
}

function whitespaceNormalizedStrategy(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): FuzzyMatchResult | null {
  const norm = (s: string) => s.replace(/[\t ]+/g, " ");
  const normOld = norm(oldStr);
  if (normOld === oldStr) return null;
  const normContent = norm(content);
  const result = exactStrategy(normContent, normOld, newStr, replaceAll);
  if (!result) return null;
  return { ...result, strategy: "whitespace_normalized" };
}

function indentationFlexibleStrategy(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): FuzzyMatchResult | null {
  const stripLeading = (s: string) =>
    s.split("\n").map((line) => line.replace(/^[\t ]+/, "")).join("\n");
  const strippedOld = stripLeading(oldStr);
  const strippedContent = stripLeading(content);
  if (!strippedContent.includes(strippedOld)) return null;
  const result = exactStrategy(strippedContent, strippedOld, newStr, replaceAll);
  if (!result) return null;
  return { ...result, strategy: "indentation_flexible" };
}

function escapeNormalizedStrategy(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): FuzzyMatchResult | null {
  if (!oldStr.includes("\\n") && !oldStr.includes("\\t")) return null;
  const unescape = (s: string) => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  const normOld = unescape(oldStr);
  const result = exactStrategy(content, normOld, newStr, replaceAll);
  if (!result) return null;
  return { ...result, strategy: "escape_normalized" };
}

function unicodeNormalizedStrategy(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): FuzzyMatchResult | null {
  const normOld = unicodeNormalize(oldStr);
  if (normOld === oldStr) return null;
  const normContent = unicodeNormalize(content);
  const result = exactStrategy(normContent, normOld, newStr, replaceAll);
  if (!result) return null;
  return { ...result, strategy: "unicode_normalized" };
}

// TODO(m1-followup): strategies 6-8 (trimmed_boundary, block_anchor,
// context_aware with SequenceMatcher) need a diff-like similarity helper;
// port in a dedicated PR so full semantics carry over from Hermes.

const STRATEGIES = [
  exactStrategy,
  lineTrimmedStrategy,
  whitespaceNormalizedStrategy,
  indentationFlexibleStrategy,
  escapeNormalizedStrategy,
  unicodeNormalizedStrategy,
];

export function fuzzyFindAndReplace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): FuzzyMatchResult {
  if (oldString === "") {
    return { content, matchCount: 0, strategy: null, error: "old_string is empty" };
  }
  for (const strategy of STRATEGIES) {
    const result = strategy(content, oldString, newString, replaceAll);
    if (result) return result;
  }
  return { content, matchCount: 0, strategy: null, error: "no match" };
}
