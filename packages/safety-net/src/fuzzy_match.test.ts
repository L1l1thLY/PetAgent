import { describe, it, expect } from "vitest";
import { fuzzyFindAndReplace, unicodeNormalize } from "./fuzzy_match.js";

describe("fuzzyFindAndReplace", () => {
  it("strategy 1: exact match", () => {
    const r = fuzzyFindAndReplace("def foo():\n    pass", "def foo():", "def bar():");
    expect(r.strategy).toBe("exact");
    expect(r.content).toBe("def bar():\n    pass");
  });

  it("errors when exact match is ambiguous and replaceAll false", () => {
    const r = fuzzyFindAndReplace("a\na\na\n", "a", "b", false);
    expect(r.error).toMatch(/matched 3 times/);
    expect(r.strategy).toBe("exact");
  });

  it("replaces all occurrences when replaceAll true", () => {
    const r = fuzzyFindAndReplace("a\na\na\n", "a", "b", true);
    expect(r.content).toBe("b\nb\nb\n");
    expect(r.matchCount).toBe(3);
  });

  it("strategy 2: line-trimmed whitespace", () => {
    const content = "  def foo():  \n    pass\n";
    const r = fuzzyFindAndReplace(content, "def foo():\npass", "def bar():\npass");
    expect(r.strategy).toBe("line_trimmed");
    expect(r.content).toContain("def bar():");
  });

  it("strategy 5: escape-normalized \\n literal", () => {
    const r = fuzzyFindAndReplace("def foo():\n    pass", "def foo():\\n    pass", "def bar():");
    expect(r.strategy).toBe("escape_normalized");
    expect(r.content).toBe("def bar():");
  });

  it("strategy: unicode normalized smart quotes", () => {
    const content = 'print("hello")';
    const r = fuzzyFindAndReplace(content, 'print(\u201chello\u201d)', 'print("world")');
    expect(r.strategy).toBe("unicode_normalized");
    expect(r.content).toBe('print("world")');
  });

  it("returns error when no strategy matches", () => {
    const r = fuzzyFindAndReplace("hello world", "foobar", "baz");
    expect(r.strategy).toBeNull();
    expect(r.error).toBe("no match");
  });

  it("rejects empty old_string", () => {
    const r = fuzzyFindAndReplace("anything", "", "x");
    expect(r.error).toBe("old_string is empty");
  });
});

describe("unicodeNormalize", () => {
  it("replaces smart quotes and em-dashes", () => {
    expect(unicodeNormalize("\u201chi\u201d\u2014x")).toBe('"hi"--x');
  });
});
