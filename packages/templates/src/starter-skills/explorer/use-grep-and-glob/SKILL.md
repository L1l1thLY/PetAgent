---
name: use-grep-and-glob
description: Find files and code patterns fast. Use for every codebase question that starts with "where is X" or "how is Y used".
---

# Use Grep and Glob

Treat Grep and Glob as the first tools, not the last. Reading whole files to find something is a last resort.

## Choose the right tool

- **Glob** for file discovery by name or path (`src/**/*.test.ts`, `**/package.json`).
- **Grep** for content search (regex, case-sensitive by default). Prefer it over reading files when you're looking for a specific string.

## Patterns worth knowing

- Search by filetype: pass `type: "ts"` to Grep; faster and avoids lockfiles / node_modules noise.
- Show surrounding context: `-C 3` (3 lines before + after). Use when the match alone isn't enough.
- Scope by path: Grep's `path` argument limits the search subtree; useful when you already have a lead.
- Case-insensitive with `-i` — only when you know the symbol capitalization varies.

## When to escalate to Agent/Explore

If a question would require more than a handful of Grep/Glob calls to answer, launch the Explore agent instead of running them serially yourself. The Explore agent parallelizes and returns a summary — cheaper than iterating one grep at a time.

## Output

End with `## Findings` listing `path:line` references. Direct quotes from matches are fine when they clarify; do not paraphrase what the code actually says.
