import { describe, it, expect } from "vitest";
import {
  PSYCH_CAPABILITY_DEFAULTS,
  PSYCH_CAPABILITY_FALLBACK,
} from "../psychologist/psych_capability_registry.js";

describe("PSYCH_CAPABILITY_DEFAULTS", () => {
  it("grants all four capabilities to petagent-native workers", () => {
    expect(PSYCH_CAPABILITY_DEFAULTS.petagent).toEqual({
      supportsInstructionsBundle: true,
      supportsBoardComment: true,
      supportsIssuePause: true,
      supportsIssueSplit: true,
    });
  });

  it("grants bundle + comment but denies pause/split for claude_local", () => {
    expect(PSYCH_CAPABILITY_DEFAULTS.claude_local).toEqual({
      supportsInstructionsBundle: true,
      supportsBoardComment: true,
      supportsIssuePause: false,
      supportsIssueSplit: false,
    });
  });

  it("covers the same external adapters the platform ships", () => {
    for (const key of [
      "claude_local",
      "codex_local",
      "cursor",
      "opencode_local",
      "gemini_local",
      "hermes_local",
    ]) {
      const record = PSYCH_CAPABILITY_DEFAULTS[key];
      expect(record, `missing entry for ${key}`).toBeDefined();
      expect(record.supportsInstructionsBundle).toBe(true);
      expect(record.supportsBoardComment).toBe(true);
      expect(record.supportsIssuePause).toBe(false);
      expect(record.supportsIssueSplit).toBe(false);
    }
  });
});

describe("PSYCH_CAPABILITY_FALLBACK", () => {
  it("only allows board comments by default", () => {
    expect(PSYCH_CAPABILITY_FALLBACK).toEqual({
      supportsInstructionsBundle: false,
      supportsBoardComment: true,
      supportsIssuePause: false,
      supportsIssueSplit: false,
    });
  });
});
