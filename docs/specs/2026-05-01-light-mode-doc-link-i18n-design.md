---
title: Light-mode default, doc link fix, and i18n (Phase 1) — design
date: 2026-05-01
status: approved
scope: ui
---

# Light-mode default, doc link fix, and i18n (Phase 1)

## Goals

Three user-facing UI changes:

1. **Default theme = light** instead of dark for first-time visitors
2. **Documentation link** in the sidebar account menu points to the real GitHub repo
3. **Bilingual (English / Simplified Chinese) UI** with browser-language detection and an in-app language toggle — implemented in two phases; **only Phase 1 (infrastructure + 4 sample pages) is in scope for this spec**

Out of scope: OS `prefers-color-scheme` auto-detection, server-side persistence of language preference, Traditional Chinese, RTL languages, fully translating the remaining ~250 `.tsx` files (deferred to Phase 2).

## Task 1 — Default theme = light

The current default cascade is dark in three places (`index.html` HTML class, inline init script fallback, `ThemeContext.tsx` fallback). All three flip to light. The `theme-color` meta tag is also updated so the mobile browser chrome matches.

| File | Current | Change to |
|------|---------|-----------|
| `ui/index.html:2` | `<html lang="en" class="dark">` | `<html lang="en">` |
| `ui/index.html:6` | `<meta name="theme-color" content="#0c0e16">` | `<meta name="theme-color" content="#f4f1ec">` |
| `ui/index.html:35` | inline script fallback `"dark"` | `"light"` |
| `ui/src/context/ThemeContext.tsx:25` | `return "dark"` | `return "light"` |

**Existing user behavior**: localStorage `petagent.theme=dark` still wins. A user who previously chose dark stays in dark. Only first-time visitors (and users who clear localStorage) see the new default.

**Why no `prefers-color-scheme` detection**: user did not request it. Adding it changes behavior for users who never explicitly chose a theme — a separate decision. Tracked as a follow-up.

## Task 2 — Documentation link

`ui/src/components/SidebarAccountMenu.tsx:23`:

```ts
const DOCS_URL = "https://github.com/L1l1thLY/AgentCompany";
```

The "Documentation" entry in the account popover continues to use `external` (new tab, `target="_blank"`, `rel="noreferrer"`). No copy/icon changes.

## Task 3 — i18n architecture

### Library choice

`react-i18next` + `i18next` + `i18next-browser-languagedetector`.

- Mature, React-first, Hook API (`useTranslation`)
- Supports namespace splitting (one JSON per page) for tree-shake-friendly growth
- Built-in fallback chain (missing key → fallback locale → key string)
- Bundle cost ≈ 30 KB gzip, acceptable

### Directory layout

```
ui/src/
  i18n/
    index.ts                 # i18next.init() — namespaces, fallback, detection plumbing
    detect.ts                # pure `detectInitialLanguage(navigator, storage)` helper
    types.ts                 # SupportedLanguage type, namespace literal union
    locales/
      en/
        common.json
        sidebar.json
        dashboard.json
        settings.json
        board.json
      zh/
        common.json
        sidebar.json
        dashboard.json
        settings.json
        board.json
  context/
    LanguageContext.tsx      # React context with { language, setLanguage }
                             # mirrors ThemeContext shape & semantics
```

Phase 2 will add one JSON pair per remaining page (`issues.json`, `roles.json`, `interventions.json`, `notes.json`, `notifications.json`, ...) and migrate strings page-by-page. The infrastructure built in Phase 1 supports this with no further structural changes.

### Initial-language detection

Pure function `detectInitialLanguage(navigatorLike, storageLike)` returns `"en"` or `"zh"`:

1. If `storage.getItem("petagent.language")` is `"en"` or `"zh"` → return it (explicit user choice wins)
2. Else if `navigator.language` (or any of `navigator.languages`) starts with `"zh"` → return `"zh"`
3. Else → return `"en"`

Wrapped in try/catch so missing `localStorage` (rare browsers, Safari private mode in some configurations) falls through to `navigator.language` rather than crashing. The detection function is pure so it's unit-testable without a DOM.

### Persistence

- Key: `"petagent.language"`
- Values: `"en"` | `"zh"`
- Set via `LanguageContext.setLanguage()` which also calls `i18n.changeLanguage()`
- No migration needed (key is new)

### Hook usage pattern (developer-facing)

```tsx
import { useTranslation } from "react-i18next";

function Dashboard() {
  const { t } = useTranslation("dashboard");
  return <h1>{t("title")}</h1>;
}
```

Translation keys are flat per-namespace (e.g., `dashboard.json` has `{ "title": "Dashboard", "subtitle": "..." }`), called as `t("title")` after `useTranslation("dashboard")`. The `common` namespace is auto-loaded for cross-page strings (`t("common:save")`).

### Provider composition

`LanguageProvider` wraps `App` in `main.tsx`, **outside** `ThemeProvider` (language doesn't depend on theme; theme initialisation is synchronous via the inline script in `index.html`, language initialises via context on mount). Provider order:

```
<LanguageProvider>
  <ThemeProvider>
    <CompanyProvider>
      ... existing tree ...
```

`i18n.init()` runs at module-import time in `i18n/index.ts` and is imported once by `main.tsx`, before React renders. This avoids a "flash of English text" on first paint for Chinese-preferring browsers.

## UI entry points for the language toggle

Two locations share the same `LanguageContext`:

1. **Sidebar account popover** (`SidebarAccountMenu.tsx`) — adds a `MenuAction` row below the theme toggle. Label cycles between `"中文 / English"` and `"English / 中文"` based on current language; clicking toggles immediately. Keeps the popover open after click (consistent with theme toggle).

2. **Instance General Settings page** (`InstanceGeneralSettings.tsx`) — a "Language" card with two radio options (`English`, `中文`). Updates immediately on selection (no Save button — same pattern as the existing keyboard shortcuts toggle).

## Translation strategy

### Phase 1 — sample pages (this spec)

These four files (and any shared components they render) are fully translated:

1. **Sidebar + account menu** (`Sidebar.tsx`, `SidebarAccountMenu.tsx`, `BreadcrumbBar.tsx`) — always visible, highest leverage
2. **Dashboard** (`Dashboard.tsx`) — landing page after login
3. **Instance General Settings** (`InstanceGeneralSettings.tsx`) — hosts the language switcher; users will be on this page when changing language
4. **Board** (`Board.tsx`, `EmployeeBar`, `IssueCard`, `RolePalette`, `HireDialog`) — main work surface

Phase 1 also fully populates `common.json` (Save / Cancel / Delete / Loading… / Failed to copy / Confirm / etc.), so Phase 2 pages don't have to redefine common words.

### Phase 2 — remaining pages (deferred, not in this spec)

Tracked as follow-up work. Each remaining top-level page becomes one PR/commit migrating its strings + adding its `<page>.json` namespace pair. Phase 2 will not require any infrastructure changes.

### Terminology — keep in English

These technical terms stay English in both locales:

| Term | Reason |
|------|--------|
| Agent / Worker | Product vocabulary; renaming risks confusion with translated text |
| Issue / Sub-issue | Same |
| Skill | Same |
| Heartbeat | Tracing / observability term |
| Role / Role Template | Same |
| Coordinator / Psychologist / Reflector | Built-in agent role names |
| Notes | Domain term (M2 feature) |
| Hook / MCP / Plugin / Routine | Integration vocabulary |
| Notification | UI element name |
| Board / Kanban | UI surface name |
| KPI / Webhook / Token | Standard tech terms |

Sentences containing these terms still translate, with the term inline:

- "Open PetAgent docs in a new tab." → "在新标签页打开 PetAgent 文档"
- "Switch to light mode" → "切换到浅色模式"
- "Recent issues assigned to you" → "最近分配给你的 Issue"
- "Hire a new role" → "招聘新 Role"
- "Heartbeat ended" → "Heartbeat 结束"

The full Phase 1 translation will be reviewed for consistency before commit; Phase 2 will reference this glossary.

## Testing

- `i18n/detect.test.ts` — unit tests for `detectInitialLanguage` covering: explicit storage `en`, explicit storage `zh`, `navigator.language = "zh-CN"`, `"zh-TW"`, `"zh-HK"`, `"en-US"`, `"fr-FR"`, missing `navigator.language`, throwing storage
- `LanguageContext.test.tsx` — set language → reads back → reload simulation reads it from storage; missing storage handled gracefully; fallback to `en` on unknown stored value
- For each of the 4 sample pages: render in EN and ZH, assert at least one localized string differs; verify no React render warnings or thrown errors
- Existing snapshot tests that match the migrated literals will be regenerated in a dedicated commit (`pnpm test -u`) so the snapshot churn is reviewable separately

Not done: visual regression testing (project has no Playwright/Chromatic setup), translation-completeness assertions for all 600+ strings (no value), Phase 2 page tests.

## Risk register

| Risk | Mitigation |
|------|------------|
| Phase 1 mid-migration UX is "half English / half Chinese" | Accepted; user confirmed staged rollout |
| `t()` call missed for some literal in a migrated file | Optional: ESLint `i18next/no-literal-string` scoped via `overrides` to the 4 Phase 1 paths; warn-level so it nudges without blocking |
| Chinese text breaks layout (longer / shorter than English) | Translate with length parity in mind; smoke-test both locales |
| `localStorage` unavailable (private mode, embedded webview) | Detection wrapped in try/catch, falls back to `navigator.language` |
| react-i18next bundle size (~30 KB gzip) | Acceptable; UI bundle already orders of magnitude larger |
| Existing snapshot tests fail | Dedicated commit regenerates snapshots; review the diff for unintended changes |
| First-paint "flash of English" for zh users | `i18n.init()` runs before React renders; detection is synchronous |

## Implementation order (overview)

The detailed step-by-step plan is produced separately by the writing-plans skill, but the sequencing is:

1. Task 1 (theme default flip) — safest first, near-zero risk, ships value immediately
2. Task 2 (doc link) — single line change
3. Task 3 Phase 1:
   1. Install dependencies
   2. Build `i18n/` infrastructure (init, detect, types, empty locale files)
   3. Build `LanguageContext` + tests
   4. Wire `LanguageProvider` into `main.tsx`
   5. Add language switcher in `SidebarAccountMenu`
   6. Add language card in `InstanceGeneralSettings`
   7. Migrate Sidebar / Dashboard / Board / General Settings to `useTranslation`
   8. Populate `common.json` + page namespaces (EN + ZH)
   9. Regenerate snapshots
   10. Verify EN-only and ZH-only renders pass tests

## Glossary stub (full version produced during Phase 1)

The complete EN→ZH sentence glossary lives in the locale JSON files; this section will be expanded into a translator-style reference once Phase 1 implementation begins. Initial seed:

| English | 中文 |
|---------|------|
| Save | 保存 |
| Cancel | 取消 |
| Delete | 删除 |
| Confirm | 确认 |
| Loading… | 加载中… |
| Loading failed | 加载失败 |
| Try again | 重试 |
| Search | 搜索 |
| Filter | 筛选 |
| Settings | 设置 |
| Profile | 个人资料 |
| Sign out | 退出登录 |
| Documentation | 文档 |
| Switch to light mode | 切换到浅色模式 |
| Switch to dark mode | 切换到深色模式 |
| Language | 语言 |
| English | English |
| 中文 | 中文 |
