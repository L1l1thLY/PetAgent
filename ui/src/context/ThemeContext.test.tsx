// @vitest-environment node

import { describe, expect, it } from "vitest";
import { resolveThemeFromDocumentForTest } from "./ThemeContext";

describe("resolveThemeFromDocument (SSR fallback)", () => {
  it("returns 'light' when document is undefined", () => {
    expect(resolveThemeFromDocumentForTest()).toBe("light");
  });
});
