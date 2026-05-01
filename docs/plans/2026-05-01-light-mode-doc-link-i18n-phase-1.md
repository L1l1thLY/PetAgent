# Light-mode default, doc link fix, and i18n Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip default UI theme to light, point the Documentation link at the real GitHub repo, and introduce react-i18next-based EN/中文 bilingual support for four sample pages (Phase 1 of a staged rollout).

**Architecture:** Three independent change groups in one plan, sequenced safest-first. (1) Theme: edit four constants/values across `ui/index.html` + `ThemeContext.tsx`. (2) Doc link: single-string constant swap in `SidebarAccountMenu.tsx`. (3) i18n: add `react-i18next` + `i18next-browser-languagedetector`, build `i18n/` module + `LanguageContext`, wire provider into `main.tsx`, then migrate Sidebar / Dashboard / Instance General Settings / Board to `useTranslation`. Persistence is localStorage-only (key `petagent.language`); detection is pure-function `(navigator, storage) → "en" | "zh"`. Translation keys are namespaced per page; technical terms (Agent / Issue / Skill / etc.) stay English in both locales.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Vitest 3 with jsdom env, react-i18next, i18next, i18next-browser-languagedetector, lucide-react (existing).

**Source spec:** `docs/specs/2026-05-01-light-mode-doc-link-i18n-design.md`

**Test conventions in this repo (from existing tests):**
- Per-file `// @vitest-environment jsdom` comment (root vitest config defaults to `node`)
- `import { act } from "react"` + `createRoot` from `react-dom/client`
- Set `(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true`
- No `@testing-library/react` is installed — assert via `container.textContent` / `document.body.textContent`
- Mock external dependencies via `vi.mock(...)` and `vi.hoisted(...)` for hoisted refs

---

## File Structure

**Created:**
- `ui/src/i18n/index.ts` — i18next.init() configuration; imported once by `main.tsx`
- `ui/src/i18n/detect.ts` — pure `detectInitialLanguage(navigator, storage)` helper
- `ui/src/i18n/detect.test.ts` — unit tests for detection logic
- `ui/src/i18n/types.ts` — `SupportedLanguage`, `LANGUAGE_STORAGE_KEY` constants
- `ui/src/i18n/locales/en/common.json` + `zh/common.json` — cross-page strings (Save / Cancel / etc.)
- `ui/src/i18n/locales/en/sidebar.json` + `zh/sidebar.json` — Sidebar + account menu
- `ui/src/i18n/locales/en/dashboard.json` + `zh/dashboard.json` — Dashboard page
- `ui/src/i18n/locales/en/settings.json` + `zh/settings.json` — Instance General Settings + Language card
- `ui/src/i18n/locales/en/board.json` + `zh/board.json` — Board page
- `ui/src/context/LanguageContext.tsx` — React provider exposing `{ language, setLanguage }`
- `ui/src/context/LanguageContext.test.tsx` — provider behavior tests

**Modified:**
- `ui/index.html` — flip default theme to light (3 spots) + theme-color meta tag
- `ui/src/context/ThemeContext.tsx` — flip SSR fallback + align theme-color constants with `index.html`
- `ui/src/components/SidebarAccountMenu.tsx` — `DOCS_URL` change + `useTranslation` migration + add language toggle `MenuAction`
- `ui/src/components/SidebarAccountMenu.test.tsx` — wrap test render with `I18nextProvider`; update assertions if needed
- `ui/src/main.tsx` — import `./i18n` for side-effects + add `<LanguageProvider>` outside `<ThemeProvider>`
- `ui/src/pages/Dashboard.tsx` — `useTranslation` migration
- `ui/src/components/Sidebar.tsx` and direct children (`SidebarSection`, `SidebarNavItem` consumers) — `useTranslation` for nav labels
- `ui/src/pages/InstanceGeneralSettings.tsx` — `useTranslation` migration + new "Language" section
- `ui/src/pages/Board.tsx` and Board-specific helpers (`board-visuals.ts` for any user-visible strings) — `useTranslation` migration
- `ui/package.json` — add 3 dependencies

---

## Task 1: Flip default theme to light

**Files:**
- Modify: `ui/index.html`
- Modify: `ui/src/context/ThemeContext.tsx`
- Test: `ui/src/context/ThemeContext.test.tsx` (new file)

- [ ] **Step 1: Write the failing test for SSR fallback**

Create `ui/src/context/ThemeContext.test.tsx`:

```tsx
// @vitest-environment node

import { describe, expect, it } from "vitest";
import { resolveThemeFromDocumentForTest } from "./ThemeContext";

describe("resolveThemeFromDocument (SSR fallback)", () => {
  it("returns 'light' when document is undefined", () => {
    expect(resolveThemeFromDocumentForTest()).toBe("light");
  });
});
```

(We will export a test-only helper from `ThemeContext.tsx` in Step 3 to expose the SSR branch without DOM mocking.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @petagent/ui test -- ThemeContext.test.tsx`

Expected: FAIL — either "module has no export resolveThemeFromDocumentForTest" or assertion fails because current value is `"dark"`.

- [ ] **Step 3: Update `ThemeContext.tsx` to fix the test**

In `ui/src/context/ThemeContext.tsx`:

1. Change line 25 from `if (typeof document === "undefined") return "dark";` to:

```ts
  if (typeof document === "undefined") return "light";
```

2. Align the theme-color constants with `index.html` (which uses different colors and is the bootstrap source of truth). Replace lines 20-21:

```ts
const DARK_THEME_COLOR = "#0c0e16";
const LIGHT_THEME_COLOR = "#f4f1ec";
```

3. Append a test-only export at the very bottom of the file:

```ts
// Exported for unit tests; do not use in app code.
export const resolveThemeFromDocumentForTest = resolveThemeFromDocument;
```

- [ ] **Step 4: Update `ui/index.html` to flip the default**

Three changes:

Line 2:
```html
<html lang="en">
```
(remove `class="dark"`)

Line 6:
```html
<meta name="theme-color" content="#f4f1ec" />
```

Line 35: change the inline-script fallback from:
```js
const theme = stored === "light" || stored === "dark" ? stored : "dark";
```
to:
```js
const theme = stored === "light" || stored === "dark" ? stored : "light";
```

Lines 43-46 (the `catch` branch) — flip the failure-path default:
```js
} catch {
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "light";
}
```

- [ ] **Step 5: Run test to verify it passes + typecheck**

Run: `pnpm --filter @petagent/ui test -- ThemeContext.test.tsx`

Expected: PASS.

Run: `pnpm --filter @petagent/ui typecheck`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add ui/index.html ui/src/context/ThemeContext.tsx ui/src/context/ThemeContext.test.tsx
git commit -m "feat(ui): default theme = light for first-time visitors

Flips index.html default class, inline init script fallback, and
ThemeContext SSR fallback from dark to light. Aligns ThemeContext
theme-color constants with index.html (#0c0e16 / #f4f1ec). Existing
users with localStorage 'petagent.theme=dark' are unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Documentation link → GitHub repo

**Files:**
- Modify: `ui/src/components/SidebarAccountMenu.tsx:23`
- Modify: `ui/src/components/SidebarAccountMenu.test.tsx` (add href assertion)

- [ ] **Step 1: Add a failing test that asserts the new URL**

Open `ui/src/components/SidebarAccountMenu.test.tsx`. After the existing `expect(document.body.textContent).toContain("Documentation");` line, add:

```tsx
const docsLink = document.body.querySelector('a[href="https://github.com/L1l1thLY/AgentCompany"]');
expect(docsLink).not.toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @petagent/ui test -- SidebarAccountMenu.test.tsx`

Expected: FAIL — `docsLink` is null because the current URL is `https://docs.petagent.ing/`.

- [ ] **Step 3: Update the constant in `SidebarAccountMenu.tsx:23`**

```ts
const DOCS_URL = "https://github.com/L1l1thLY/AgentCompany";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @petagent/ui test -- SidebarAccountMenu.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/SidebarAccountMenu.tsx ui/src/components/SidebarAccountMenu.test.tsx
git commit -m "fix(ui): point Documentation link to AgentCompany GitHub repo

Replaces the Paperclip-fork placeholder URL (https://docs.petagent.ing/)
with the canonical project repo so users land on real documentation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Install i18n dependencies

**Files:**
- Modify: `ui/package.json`

- [ ] **Step 1: Add the three dependencies**

```bash
pnpm --filter @petagent/ui add react-i18next i18next i18next-browser-languagedetector
```

- [ ] **Step 2: Verify install**

Run: `pnpm --filter @petagent/ui list react-i18next i18next i18next-browser-languagedetector`

Expected: all three resolve with versions printed.

- [ ] **Step 3: Verify build still passes**

Run: `pnpm --filter @petagent/ui build`

Expected: PASS (no code uses the new packages yet).

- [ ] **Step 4: Commit**

```bash
git add ui/package.json pnpm-lock.yaml
git commit -m "chore(ui): add react-i18next, i18next, language detector deps

Pulls in the libraries Phase 1 i18n infrastructure depends on. No
runtime code references them yet — that arrives in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pure language detection helper

**Files:**
- Create: `ui/src/i18n/types.ts`
- Create: `ui/src/i18n/detect.ts`
- Test: `ui/src/i18n/detect.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// ui/src/i18n/types.ts

export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "petagent.language";
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === "en" || value === "zh";
}
```

- [ ] **Step 2: Write the failing tests for `detectInitialLanguage`**

Create `ui/src/i18n/detect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectInitialLanguage } from "./detect";

function makeStorage(initial: Record<string, string> = {}, opts: { throws?: boolean } = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => {
      if (opts.throws) throw new Error("storage unavailable");
      return data.has(key) ? data.get(key)! : null;
    },
    key: (n) => Array.from(data.keys())[n] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      if (opts.throws) throw new Error("storage unavailable");
      data.set(key, value);
    },
  } as Storage;
}

describe("detectInitialLanguage", () => {
  it("returns stored language when set to 'en'", () => {
    const storage = makeStorage({ "petagent.language": "en" });
    expect(detectInitialLanguage({ language: "zh-CN" }, storage)).toBe("en");
  });

  it("returns stored language when set to 'zh'", () => {
    const storage = makeStorage({ "petagent.language": "zh" });
    expect(detectInitialLanguage({ language: "en-US" }, storage)).toBe("zh");
  });

  it("ignores unknown stored values and falls through to navigator", () => {
    const storage = makeStorage({ "petagent.language": "fr" });
    expect(detectInitialLanguage({ language: "zh-TW" }, storage)).toBe("zh");
  });

  it("returns 'zh' for navigator.language = 'zh-CN'", () => {
    expect(detectInitialLanguage({ language: "zh-CN" }, makeStorage())).toBe("zh");
  });

  it("returns 'zh' for navigator.language = 'zh-TW'", () => {
    expect(detectInitialLanguage({ language: "zh-TW" }, makeStorage())).toBe("zh");
  });

  it("returns 'zh' for navigator.language = 'zh-HK'", () => {
    expect(detectInitialLanguage({ language: "zh-HK" }, makeStorage())).toBe("zh");
  });

  it("returns 'zh' when navigator.languages contains zh, even if .language does not", () => {
    expect(
      detectInitialLanguage({ language: "en-US", languages: ["en-US", "zh-CN"] }, makeStorage()),
    ).toBe("zh");
  });

  it("returns 'en' for navigator.language = 'en-US'", () => {
    expect(detectInitialLanguage({ language: "en-US" }, makeStorage())).toBe("en");
  });

  it("returns 'en' for navigator.language = 'fr-FR'", () => {
    expect(detectInitialLanguage({ language: "fr-FR" }, makeStorage())).toBe("en");
  });

  it("returns 'en' when navigator is null", () => {
    expect(detectInitialLanguage(null, makeStorage())).toBe("en");
  });

  it("returns 'en' when storage throws (private mode)", () => {
    const storage = makeStorage({}, { throws: true });
    expect(detectInitialLanguage({ language: "en-US" }, storage)).toBe("en");
  });

  it("still falls through to navigator when storage throws and navigator is zh", () => {
    const storage = makeStorage({}, { throws: true });
    expect(detectInitialLanguage({ language: "zh-CN" }, storage)).toBe("zh");
  });

  it("returns 'en' when storage is null entirely", () => {
    expect(detectInitialLanguage({ language: "en" }, null)).toBe("en");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @petagent/ui test -- detect.test.ts`

Expected: FAIL — `detect.ts` does not exist yet.

- [ ] **Step 4: Implement `detect.ts`**

Create `ui/src/i18n/detect.ts`:

```ts
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  type SupportedLanguage,
} from "./types";

interface NavigatorLike {
  language?: string;
  languages?: readonly string[];
}

export function detectInitialLanguage(
  navigatorLike: NavigatorLike | null | undefined,
  storage: Storage | null | undefined,
): SupportedLanguage {
  // 1. Explicit user choice (localStorage) wins.
  try {
    const stored = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }
  } catch {
    // Storage unavailable (private mode, embedded webview) — fall through.
  }

  // 2. navigator.language[s] starts with "zh" → zh.
  const candidates: string[] = [];
  if (navigatorLike?.language) candidates.push(navigatorLike.language);
  if (navigatorLike?.languages) candidates.push(...navigatorLike.languages);
  for (const tag of candidates) {
    if (typeof tag === "string" && tag.toLowerCase().startsWith("zh")) {
      return "zh";
    }
  }

  // 3. Default.
  return DEFAULT_LANGUAGE;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @petagent/ui test -- detect.test.ts`

Expected: all 13 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/src/i18n/types.ts ui/src/i18n/detect.ts ui/src/i18n/detect.test.ts
git commit -m "feat(ui): pure detectInitialLanguage helper for i18n

Adds a side-effect-free detector that prefers explicit localStorage
choice, then navigator.language(s) starting with 'zh', else 'en'.
Wrapped in try/catch so storage unavailability falls through to
navigator detection rather than crashing. 13 unit tests cover the
decision tree.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Locale JSON files (EN + 中文)

**Files:**
- Create: `ui/src/i18n/locales/en/common.json`
- Create: `ui/src/i18n/locales/zh/common.json`
- Create: `ui/src/i18n/locales/en/sidebar.json`
- Create: `ui/src/i18n/locales/zh/sidebar.json`
- Create: `ui/src/i18n/locales/en/dashboard.json`
- Create: `ui/src/i18n/locales/zh/dashboard.json`
- Create: `ui/src/i18n/locales/en/settings.json`
- Create: `ui/src/i18n/locales/zh/settings.json`
- Create: `ui/src/i18n/locales/en/board.json`
- Create: `ui/src/i18n/locales/zh/board.json`

This task only creates the JSON files. They are imported in Task 6 (`i18n/index.ts`). Subsequent migration tasks (10–14) reference keys defined here.

- [ ] **Step 1: Write `common.json` (EN + ZH)**

`ui/src/i18n/locales/en/common.json`:

```json
{
  "save": "Save",
  "cancel": "Cancel",
  "delete": "Delete",
  "confirm": "Confirm",
  "close": "Close",
  "loading": "Loading…",
  "loadingFailed": "Loading failed",
  "tryAgain": "Try again",
  "search": "Search",
  "filter": "Filter",
  "settings": "Settings",
  "edit": "Edit",
  "remove": "Remove",
  "copy": "Copy",
  "copyFailed": "Copy failed",
  "copied": "Copied",
  "ok": "OK",
  "back": "Back",
  "next": "Next",
  "previous": "Previous",
  "name": "Name",
  "description": "Description",
  "yes": "Yes",
  "no": "No",
  "actions": "Actions",
  "details": "Details",
  "more": "More",
  "all": "All",
  "none": "None",
  "ready": "Ready",
  "notReady": "Not ready",
  "active": "Active",
  "inactive": "Inactive"
}
```

`ui/src/i18n/locales/zh/common.json`:

```json
{
  "save": "保存",
  "cancel": "取消",
  "delete": "删除",
  "confirm": "确认",
  "close": "关闭",
  "loading": "加载中…",
  "loadingFailed": "加载失败",
  "tryAgain": "重试",
  "search": "搜索",
  "filter": "筛选",
  "settings": "设置",
  "edit": "编辑",
  "remove": "移除",
  "copy": "复制",
  "copyFailed": "复制失败",
  "copied": "已复制",
  "ok": "好的",
  "back": "返回",
  "next": "下一步",
  "previous": "上一步",
  "name": "名称",
  "description": "描述",
  "yes": "是",
  "no": "否",
  "actions": "操作",
  "details": "详情",
  "more": "更多",
  "all": "全部",
  "none": "无",
  "ready": "就绪",
  "notReady": "未就绪",
  "active": "活跃",
  "inactive": "未活跃"
}
```

- [ ] **Step 2: Write `sidebar.json` (EN + ZH)**

`ui/src/i18n/locales/en/sidebar.json`:

```json
{
  "openAccountMenu": "Open account menu",
  "boardFallbackName": "Board",
  "signedIn": "Signed in",
  "localWorkspaceBoard": "Local workspace board",
  "accountBadge": "Account",
  "localBadge": "Local",
  "version": "PetAgent v{{version}}",
  "editProfile": {
    "label": "Edit profile",
    "description": "Update your display name and avatar."
  },
  "instanceSettings": {
    "label": "Instance settings",
    "description": "Jump back to the last settings page you opened."
  },
  "documentation": {
    "label": "Documentation",
    "description": "Open PetAgent docs in a new tab."
  },
  "themeToggle": {
    "switchToLight": "Switch to light mode",
    "switchToDark": "Switch to dark mode",
    "description": "Toggle the app appearance."
  },
  "languageToggle": {
    "label": "中文 / English",
    "description": "Switch between English and Chinese."
  },
  "signOut": {
    "label": "Sign out",
    "labelPending": "Signing out...",
    "description": "End this browser session."
  },
  "nav": {
    "inbox": "Inbox",
    "board": "Board",
    "issues": "Issues",
    "dashboard": "Dashboard",
    "agents": "Agents",
    "projects": "Projects",
    "approvals": "Approvals",
    "costs": "Costs",
    "history": "History",
    "schedules": "Schedules",
    "skills": "Skills",
    "ideas": "Ideas",
    "automations": "Automations",
    "roles": "Roles",
    "interventions": "Interventions",
    "notes": "Notes",
    "newIssue": "New Issue"
  }
}
```

`ui/src/i18n/locales/zh/sidebar.json`:

```json
{
  "openAccountMenu": "打开账号菜单",
  "boardFallbackName": "Board",
  "signedIn": "已登录",
  "localWorkspaceBoard": "本地工作区 Board",
  "accountBadge": "账号",
  "localBadge": "本地",
  "version": "PetAgent v{{version}}",
  "editProfile": {
    "label": "编辑个人资料",
    "description": "更新你的显示名和头像。"
  },
  "instanceSettings": {
    "label": "实例设置",
    "description": "跳回你上次打开的设置页面。"
  },
  "documentation": {
    "label": "文档",
    "description": "在新标签页打开 PetAgent 文档。"
  },
  "themeToggle": {
    "switchToLight": "切换到浅色模式",
    "switchToDark": "切换到深色模式",
    "description": "切换应用外观。"
  },
  "languageToggle": {
    "label": "English / 中文",
    "description": "在中文和英文之间切换。"
  },
  "signOut": {
    "label": "退出登录",
    "labelPending": "正在退出…",
    "description": "结束这个浏览器会话。"
  },
  "nav": {
    "inbox": "收件箱",
    "board": "Board",
    "issues": "Issue",
    "dashboard": "仪表盘",
    "agents": "Agent",
    "projects": "项目",
    "approvals": "审批",
    "costs": "成本",
    "history": "历史",
    "schedules": "调度",
    "skills": "Skill",
    "ideas": "灵感",
    "automations": "自动化",
    "roles": "Role",
    "interventions": "情绪介入",
    "notes": "Notes",
    "newIssue": "新建 Issue"
  }
}
```

- [ ] **Step 3: Write `dashboard.json` (EN + ZH)**

`ui/src/i18n/locales/en/dashboard.json`:

```json
{
  "breadcrumb": "Dashboard",
  "welcome": "Welcome to PetAgent. Set up your first company and agent to get started.",
  "getStarted": "Get Started",
  "selectCompany": "Create or select a company to view the dashboard.",
  "noAgents": "You have no agents.",
  "createOneHere": "Create one here",
  "openBudgets": "Open budgets",
  "metrics": {
    "agentsEnabled": "Agents Enabled",
    "agentsBreakdown": "{{running}} running, {{paused}} paused, {{error}} errors",
    "tasksInProgress": "Tasks In Progress",
    "tasksBreakdown": "{{open}} open, {{blocked}} blocked",
    "monthSpend": "Month Spend",
    "monthBudgetUsed": "{{percent}}% of {{budget}} budget",
    "unlimitedBudget": "Unlimited budget",
    "pendingApprovals": "Pending Approvals",
    "budgetOverridesAwaiting": "{{count}} budget overrides awaiting board review",
    "awaitingBoardReview": "Awaiting board review"
  },
  "charts": {
    "runActivity": "Run Activity",
    "issuesByPriority": "Issues by Priority",
    "issuesByStatus": "Issues by Status",
    "successRate": "Success Rate",
    "last14Days": "Last 14 days"
  },
  "recentActivity": "Recent Activity",
  "recentTasks": "Recent Tasks",
  "noTasksYet": "No tasks yet.",
  "budgetIncident": {
    "title_one": "{{count}} active budget incident",
    "title_other": "{{count}} active budget incidents",
    "summary": "{{pausedAgents}} agents paused · {{pausedProjects}} projects paused · {{pendingApprovals}} pending budget approvals"
  }
}
```

`ui/src/i18n/locales/zh/dashboard.json`:

```json
{
  "breadcrumb": "仪表盘",
  "welcome": "欢迎使用 PetAgent。先创建你的第一家公司和 Agent 即可开始。",
  "getStarted": "立即开始",
  "selectCompany": "创建或选择一家公司以查看仪表盘。",
  "noAgents": "你还没有 Agent。",
  "createOneHere": "在这里创建一个",
  "openBudgets": "打开预算",
  "metrics": {
    "agentsEnabled": "已启用 Agent",
    "agentsBreakdown": "{{running}} 运行中,{{paused}} 已暂停,{{error}} 错误",
    "tasksInProgress": "进行中任务",
    "tasksBreakdown": "{{open}} 待处理,{{blocked}} 阻塞",
    "monthSpend": "本月花销",
    "monthBudgetUsed": "已用 {{percent}}%(总预算 {{budget}})",
    "unlimitedBudget": "无限制预算",
    "pendingApprovals": "待审批",
    "budgetOverridesAwaiting": "{{count}} 项预算覆盖待 Board 审批",
    "awaitingBoardReview": "等待 Board 审批"
  },
  "charts": {
    "runActivity": "运行活动",
    "issuesByPriority": "按优先级分组的 Issue",
    "issuesByStatus": "按状态分组的 Issue",
    "successRate": "成功率",
    "last14Days": "最近 14 天"
  },
  "recentActivity": "最近活动",
  "recentTasks": "最近任务",
  "noTasksYet": "暂无任务。",
  "budgetIncident": {
    "title_one": "{{count}} 项活跃预算告警",
    "title_other": "{{count}} 项活跃预算告警",
    "summary": "{{pausedAgents}} 个 Agent 暂停 · {{pausedProjects}} 个项目暂停 · {{pendingApprovals}} 项预算审批待处理"
  }
}
```

- [ ] **Step 4: Write `settings.json` (EN + ZH)**

`ui/src/i18n/locales/en/settings.json`:

```json
{
  "breadcrumb": {
    "instanceSettings": "Instance Settings",
    "general": "General"
  },
  "header": {
    "title": "General",
    "subtitle": "Configure instance-wide defaults that affect how operator-visible logs are displayed."
  },
  "loadingState": "Loading general settings...",
  "loadFailed": "Failed to load general settings.",
  "updateFailed": "Failed to update general settings.",
  "signOutFailed": "Failed to sign out.",
  "deployment": {
    "heading": "Deployment and auth",
    "localTrusted": "Local trusted mode is optimized for a local operator. Browser requests run as local board context and no sign-in is required.",
    "authenticatedPublic": "Authenticated public mode requires sign-in for board access and is intended for public URLs.",
    "authenticatedPrivate": "Authenticated private mode requires sign-in and is intended for LAN, VPN, or other private-network deployments.",
    "authReadiness": "Auth readiness",
    "bootstrapStatus": "Bootstrap status",
    "bootstrapInvite": "Bootstrap invite",
    "ready": "Ready",
    "notReady": "Not ready",
    "setupRequired": "Setup required",
    "active": "Active",
    "none": "None"
  },
  "censor": {
    "heading": "Censor username in logs",
    "description": "Hide the username segment in home-directory paths and similar operator-visible log output. Standalone username mentions outside of paths are not yet masked in the live transcript view. This is off by default.",
    "ariaLabel": "Toggle username log censoring"
  },
  "shortcuts": {
    "heading": "Keyboard shortcuts",
    "description": "Enable app keyboard shortcuts, including inbox navigation and global shortcuts like creating issues or toggling panels. This is off by default.",
    "ariaLabel": "Toggle keyboard shortcuts"
  },
  "language": {
    "heading": "Language",
    "description": "Choose the display language for the PetAgent UI. The change applies immediately.",
    "english": "English",
    "chinese": "中文"
  },
  "backup": {
    "heading": "Backup retention",
    "description": "Configure how long to keep automatic database backups at each tier. Daily backups are kept in full, then thinned to one per week and one per month. Backups are compressed with gzip.",
    "daily": "Daily",
    "weekly": "Weekly",
    "monthly": "Monthly",
    "days": "{{count}} days",
    "week_one": "{{count}} week",
    "week_other": "{{count}} weeks",
    "month_one": "{{count}} month",
    "month_other": "{{count}} months"
  },
  "feedback": {
    "heading": "AI feedback sharing",
    "description": "Control whether thumbs up and thumbs down votes can send the voted AI output to PetAgent Labs. Votes are always saved locally.",
    "termsLink": "Read our terms of service",
    "promptHint": "No default is saved yet. The next thumbs up or thumbs down choice will ask once and then save the answer here.",
    "alwaysAllow": "Always allow",
    "alwaysAllowDescription": "Share voted AI outputs automatically.",
    "dontAllow": "Don't allow",
    "dontAllowDescription": "Keep voted AI outputs local only.",
    "footnote": "To retest the first-use prompt in local dev, remove the {{key}} key from the {{row}} JSON row for this instance, or set it back to {{prompt}}. Unset and {{prompt}} both mean no default has been chosen yet."
  },
  "signOut": {
    "heading": "Sign out",
    "description": "Sign out of this PetAgent instance. You will be redirected to the login page.",
    "button": "Sign out",
    "buttonPending": "Signing out..."
  }
}
```

`ui/src/i18n/locales/zh/settings.json`:

```json
{
  "breadcrumb": {
    "instanceSettings": "实例设置",
    "general": "通用"
  },
  "header": {
    "title": "通用",
    "subtitle": "配置影响运维可见日志展示方式的实例级默认项。"
  },
  "loadingState": "正在加载通用设置…",
  "loadFailed": "加载通用设置失败。",
  "updateFailed": "更新通用设置失败。",
  "signOutFailed": "退出登录失败。",
  "deployment": {
    "heading": "部署与认证",
    "localTrusted": "本地受信任模式针对本地运维者优化。浏览器请求以本地 Board 上下文运行,无需登录。",
    "authenticatedPublic": "认证公开模式要求登录才能访问 Board,适用于公网 URL。",
    "authenticatedPrivate": "认证私网模式要求登录,适用于 LAN、VPN 或其他私网部署。",
    "authReadiness": "认证就绪",
    "bootstrapStatus": "引导状态",
    "bootstrapInvite": "引导邀请",
    "ready": "就绪",
    "notReady": "未就绪",
    "setupRequired": "需要配置",
    "active": "已启用",
    "none": "无"
  },
  "censor": {
    "heading": "在日志中隐去用户名",
    "description": "在 home 目录路径和类似的运维可见日志输出中隐去用户名段。脱离路径的孤立用户名提及尚未在实时转录视图中被屏蔽。默认关闭。",
    "ariaLabel": "切换日志用户名屏蔽"
  },
  "shortcuts": {
    "heading": "键盘快捷键",
    "description": "启用应用快捷键,包括 Inbox 导航,以及创建 Issue、切换面板等全局快捷键。默认关闭。",
    "ariaLabel": "切换键盘快捷键"
  },
  "language": {
    "heading": "语言",
    "description": "选择 PetAgent 界面显示语言。切换立即生效。",
    "english": "English",
    "chinese": "中文"
  },
  "backup": {
    "heading": "备份保留",
    "description": "配置自动数据库备份各档保留时长。每日备份完整保留,随后每周抽稀一份、每月抽稀一份。备份采用 gzip 压缩。",
    "daily": "每日",
    "weekly": "每周",
    "monthly": "每月",
    "days": "{{count}} 天",
    "week_one": "{{count}} 周",
    "week_other": "{{count}} 周",
    "month_one": "{{count}} 个月",
    "month_other": "{{count}} 个月"
  },
  "feedback": {
    "heading": "AI 反馈共享",
    "description": "控制点赞/点踩是否能把对应的 AI 输出回传给 PetAgent Labs。投票本身始终保存在本地。",
    "termsLink": "阅读服务条款",
    "promptHint": "尚未保存默认值。下次点赞或点踩时会询问一次,之后保存为默认。",
    "alwaysAllow": "始终允许",
    "alwaysAllowDescription": "自动共享被投票的 AI 输出。",
    "dontAllow": "不允许",
    "dontAllowDescription": "被投票的 AI 输出仅保留在本地。",
    "footnote": "若需在本地开发重测首用提示,把本实例 {{row}} JSON 行里的 {{key}} 键删掉、或重置为 {{prompt}}。未设置和 {{prompt}} 都表示尚未选择默认。"
  },
  "signOut": {
    "heading": "退出登录",
    "description": "退出这个 PetAgent 实例。你将被重定向到登录页。",
    "button": "退出登录",
    "buttonPending": "正在退出…"
  }
}
```

- [ ] **Step 5: Write `board.json` (EN + ZH)**

`ui/src/i18n/locales/en/board.json`:

```json
{
  "breadcrumb": "Board",
  "selectCompany": "Select a company from the switcher to see its board.",
  "employeeBar": {
    "noEmployees": "No employees yet — drag a role from the palette to hire.",
    "section": "Employees",
    "rolePalette": "Role palette"
  },
  "kanban": {
    "todo": "To do",
    "inProgress": "In progress",
    "done": "Done"
  },
  "issueCard": {
    "noAssignee": "Unassigned",
    "consecutiveFailuresFlag": "Consecutive failures detected"
  },
  "hireDialog": {
    "title": "Hire a new {{role}}",
    "submit": "Hire",
    "cancel": "Cancel",
    "nameLabel": "Name",
    "namePlaceholder": "Leave blank to auto-generate",
    "reportsToLabel": "Reports to",
    "reportsToNone": "(no manager)"
  }
}
```

`ui/src/i18n/locales/zh/board.json`:

```json
{
  "breadcrumb": "Board",
  "selectCompany": "从切换器中选择一家公司以查看其 Board。",
  "employeeBar": {
    "noEmployees": "还没有员工 —— 从右侧 Role 面板拖一个过来招聘。",
    "section": "员工",
    "rolePalette": "Role 面板"
  },
  "kanban": {
    "todo": "待处理",
    "inProgress": "进行中",
    "done": "已完成"
  },
  "issueCard": {
    "noAssignee": "未分配",
    "consecutiveFailuresFlag": "检测到连续失败"
  },
  "hireDialog": {
    "title": "招聘一个新的 {{role}}",
    "submit": "招聘",
    "cancel": "取消",
    "nameLabel": "名称",
    "namePlaceholder": "留空自动生成",
    "reportsToLabel": "汇报对象",
    "reportsToNone": "(无主管)"
  }
}
```

- [ ] **Step 6: Verify build still passes**

Run: `pnpm --filter @petagent/ui build`

Expected: PASS — JSON imports are unused at this point.

- [ ] **Step 7: Commit**

```bash
git add ui/src/i18n/locales/
git commit -m "feat(ui): seed locale JSON files for i18n Phase 1

Adds EN + 中文 namespaces for common, sidebar, dashboard, settings,
and board. Translation keys cover the four sample pages slated for
Phase 1 migration. Technical terms (Agent / Issue / Skill / Role /
Notes / Board / etc.) stay in English in both locales.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: i18next initialization

**Files:**
- Create: `ui/src/i18n/index.ts`

- [ ] **Step 1: Write `i18n/index.ts`**

```ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { detectInitialLanguage } from "./detect";
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, type SupportedLanguage } from "./types";

import enCommon from "./locales/en/common.json";
import enSidebar from "./locales/en/sidebar.json";
import enDashboard from "./locales/en/dashboard.json";
import enSettings from "./locales/en/settings.json";
import enBoard from "./locales/en/board.json";

import zhCommon from "./locales/zh/common.json";
import zhSidebar from "./locales/zh/sidebar.json";
import zhDashboard from "./locales/zh/dashboard.json";
import zhSettings from "./locales/zh/settings.json";
import zhBoard from "./locales/zh/board.json";

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

const initialLanguage: SupportedLanguage = detectInitialLanguage(
  typeof navigator !== "undefined" ? navigator : null,
  safeStorage(),
);

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      sidebar: enSidebar,
      dashboard: enDashboard,
      settings: enSettings,
      board: enBoard,
    },
    zh: {
      common: zhCommon,
      sidebar: zhSidebar,
      dashboard: zhDashboard,
      settings: zhSettings,
      board: zhBoard,
    },
  },
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: "common",
  ns: ["common", "sidebar", "dashboard", "settings", "board"],
  interpolation: {
    escapeValue: false, // React already escapes
  },
  returnNull: false,
  react: {
    useSuspense: false, // Resources are bundled, no async load
  },
});

// Persist whichever language ends up active so reload preserves choice.
try {
  safeStorage()?.setItem(LANGUAGE_STORAGE_KEY, initialLanguage);
} catch {
  /* ignore */
}

export { i18n };
export default i18n;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @petagent/ui typecheck`

Expected: PASS. (TypeScript needs `resolveJsonModule`; check `tsconfig.json` if it fails — should already be on for this project.)

If typecheck complains about JSON imports, add `"resolveJsonModule": true` to `ui/tsconfig.json` `compilerOptions`.

- [ ] **Step 3: Commit**

```bash
git add ui/src/i18n/index.ts
git commit -m "feat(ui): initialize i18next with EN/中文 resources

Bundles all locale JSON at module-import time so the first paint
shows the correct language for zh-preferring browsers (no FOUC).
Persists the resolved initial language back to localStorage so
subsequent reloads are deterministic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: LanguageContext

**Files:**
- Create: `ui/src/context/LanguageContext.tsx`
- Test: `ui/src/context/LanguageContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `ui/src/context/LanguageContext.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider, useLanguage } from "./LanguageContext";
import { LANGUAGE_STORAGE_KEY } from "../i18n/types";
import "../i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("LanguageContext", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.localStorage.clear();
  });

  it("exposes the current language and lets consumers change it", () => {
    let captured: { language: string; setLanguage: (l: "en" | "zh") => void } | null = null;

    function Probe() {
      captured = useLanguage();
      return null;
    }

    act(() => {
      root.render(
        <LanguageProvider>
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(captured!.language).toMatch(/^(en|zh)$/);

    act(() => {
      captured!.setLanguage("zh");
    });

    expect(captured!.language).toBe("zh");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");

    act(() => {
      captured!.setLanguage("en");
    });

    expect(captured!.language).toBe("en");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("ignores unknown stored values when reading initial state", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "xx");

    let captured: { language: string } | null = null;
    function Probe() {
      captured = useLanguage();
      return null;
    }

    act(() => {
      root.render(
        <LanguageProvider>
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(captured!.language).toMatch(/^(en|zh)$/);
  });

  it("throws when useLanguage is called outside a provider", () => {
    function ThrowingProbe() {
      useLanguage();
      return null;
    }

    expect(() => {
      act(() => {
        root.render(<ThrowingProbe />);
      });
    }).toThrow(/LanguageProvider/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @petagent/ui test -- LanguageContext.test.tsx`

Expected: FAIL — `LanguageContext.tsx` does not exist.

- [ ] **Step 3: Implement `LanguageContext.tsx`**

Create `ui/src/context/LanguageContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { i18n as appI18n } from "../i18n";
import {
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  type SupportedLanguage,
} from "../i18n/types";

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (next: SupportedLanguage) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readCurrentLanguage(): SupportedLanguage {
  const current = appI18n.language;
  return isSupportedLanguage(current) ? current : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<SupportedLanguage>(() => readCurrentLanguage());

  // Keep React state in sync if i18n.changeLanguage is called from elsewhere.
  useEffect(() => {
    const handler = (next: string) => {
      if (isSupportedLanguage(next)) setLanguageState(next);
    };
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, [i18n]);

  const setLanguage = useCallback(
    (next: SupportedLanguage) => {
      void i18n.changeLanguage(next);
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      setLanguageState(next);
    },
    [i18n],
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "zh" : "en");
  }, [language, setLanguage]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage }),
    [language, setLanguage, toggleLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @petagent/ui test -- LanguageContext.test.tsx`

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/context/LanguageContext.tsx ui/src/context/LanguageContext.test.tsx
git commit -m "feat(ui): LanguageContext with localStorage persistence

Mirrors ThemeContext shape: { language, setLanguage, toggleLanguage }.
Wraps i18n.changeLanguage and persists to localStorage. Subscribes
to i18next's languageChanged event so external mutations stay
in-sync with React state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire LanguageProvider into the app

**Files:**
- Modify: `ui/src/main.tsx`

- [ ] **Step 1: Update `main.tsx`**

Add the i18n init import (side-effect) and wrap the tree with `<LanguageProvider>` between `<QueryClientProvider>` and `<ThemeProvider>`.

Replace lines 1-22 of `ui/src/main.tsx` (current imports + initial setup) with:

```tsx
import * as React from "react";
import { StrictMode } from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "@/lib/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { CompanyProvider } from "./context/CompanyContext";
import { LiveUpdatesProvider } from "./context/LiveUpdatesProvider";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import { PanelProvider } from "./context/PanelContext";
import { SidebarProvider } from "./context/SidebarContext";
import { DialogProvider } from "./context/DialogContext";
import { EditorAutocompleteProvider } from "./context/EditorAutocompleteContext";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider } from "./context/LanguageContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initPluginBridge } from "./plugins/bridge-init";
import { PluginLauncherProvider } from "./plugins/launchers";
import "@mdxeditor/editor/style.css";
import "./i18n";
import "./index.css";
```

Then update the provider tree in the `createRoot(...).render(...)` call:

```tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <BrowserRouter>
            <CompanyProvider>
              <EditorAutocompleteProvider>
                <ToastProvider>
                  <LiveUpdatesProvider>
                    <TooltipProvider>
                      <BreadcrumbProvider>
                        <SidebarProvider>
                          <PanelProvider>
                            <PluginLauncherProvider>
                              <DialogProvider>
                                <App />
                              </DialogProvider>
                            </PluginLauncherProvider>
                          </PanelProvider>
                        </SidebarProvider>
                      </BreadcrumbProvider>
                    </TooltipProvider>
                  </LiveUpdatesProvider>
                </ToastProvider>
              </EditorAutocompleteProvider>
            </CompanyProvider>
          </BrowserRouter>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm --filter @petagent/ui build`

Expected: PASS.

- [ ] **Step 3: Verify no existing tests broke**

Run: `pnpm --filter @petagent/ui test`

Expected: all existing UI tests still PASS. (No component currently uses `useTranslation`, so adding the provider should be a no-op for them.)

If any test now fails because it pulls in `main.tsx` indirectly, look at the failure and either mock the i18n module or add it to that test's setup.

- [ ] **Step 4: Commit**

```bash
git add ui/src/main.tsx
git commit -m "feat(ui): wire LanguageProvider + i18n init into app shell

Imports the i18n module for its side-effect init, then wraps the
provider tree with LanguageProvider outside ThemeProvider. Provider
order is intentional: language preference is independent of theme,
and ThemeContext bootstraps synchronously from index.html so it does
not depend on i18n being ready.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Migrate SidebarAccountMenu + add language toggle

**Files:**
- Modify: `ui/src/components/SidebarAccountMenu.tsx`
- Modify: `ui/src/components/SidebarAccountMenu.test.tsx`

- [ ] **Step 1: Update the test to reflect new behavior**

The test currently asserts on EN strings ("Edit profile", "Documentation", etc.). After migration these come from i18n; with `lng: "en"` (default detection in jsdom where `navigator.language` is `"en-US"`), they remain identical, so most assertions still pass. The bigger change is that `SidebarAccountMenu` will call `useLanguage()` after Task 9, which throws if not inside a `LanguageProvider`. We must wrap the rendered subtree.

At the top of `SidebarAccountMenu.test.tsx`, add these imports alongside existing ones:

```tsx
import { LanguageProvider } from "../context/LanguageContext";
import "../i18n";
```

In the test body, change the `root.render(...)` call to wrap the component with `<LanguageProvider>`:

```tsx
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <SidebarAccountMenu
              deploymentMode="authenticated"
              instanceSettingsTarget="/instance/settings/general"
              version="1.2.3"
            />
          </LanguageProvider>
        </QueryClientProvider>,
      );
    });
```

After the existing assertion block in the "renders the signed-in user…" test, add:

```tsx
expect(document.body.textContent).toContain("中文 / English");
```

(In EN mode the language toggle MenuAction shows "中文 / English" because that's the cycle target.)

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @petagent/ui test -- SidebarAccountMenu.test.tsx`

Expected: FAIL on the new "中文 / English" assertion.

- [ ] **Step 3: Migrate `SidebarAccountMenu.tsx`**

Edits in `ui/src/components/SidebarAccountMenu.tsx`:

1. Add imports near the top:

```tsx
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../context/LanguageContext";
```

2. Inside `SidebarAccountMenu({ ... })`, after the existing `const { theme, toggleTheme } = useTheme();` line, add:

```tsx
  const { t } = useTranslation("sidebar");
  const { language, toggleLanguage } = useLanguage();
```

3. Replace literal `"Open account menu"` (line 128) with:

```tsx
            aria-label={t("openAccountMenu")}
```

4. Replace `"Board"` fallback (line 110):

```tsx
  const displayName = session?.user.name?.trim() || t("boardFallbackName");
```

5. Replace the secondaryLabel inline strings (line 111-112):

```tsx
  const secondaryLabel =
    session?.user.email?.trim() ||
    (deploymentMode === "authenticated" ? t("signedIn") : t("localWorkspaceBoard"));
```

6. Replace `accountBadge`:

```tsx
  const accountBadge = deploymentMode === "authenticated" ? t("accountBadge") : t("localBadge");
```

7. Replace the `PetAgent v{version}` line (line 161):

```tsx
                  <p className="mt-1 text-xs text-muted-foreground">{t("version", { version })}</p>
```

8. Replace each `MenuAction` block:

```tsx
              <MenuAction
                label={t("editProfile.label")}
                description={t("editProfile.description")}
                icon={UserRoundPen}
                href={PROFILE_SETTINGS_PATH}
                onClick={closeNavigationChrome}
              />
              <MenuAction
                label={t("instanceSettings.label")}
                description={t("instanceSettings.description")}
                icon={Settings}
                href={instanceSettingsTarget}
                onClick={closeNavigationChrome}
              />
              <MenuAction
                label={t("documentation.label")}
                description={t("documentation.description")}
                icon={BookOpen}
                href={DOCS_URL}
                external
                onClick={() => setOpen(false)}
              />
              <MenuAction
                label={
                  theme === "dark"
                    ? t("themeToggle.switchToLight")
                    : t("themeToggle.switchToDark")
                }
                description={t("themeToggle.description")}
                icon={theme === "dark" ? Sun : Moon}
                onClick={() => {
                  toggleTheme();
                  setOpen(false);
                }}
              />
              <MenuAction
                label={t("languageToggle.label")}
                description={t("languageToggle.description")}
                icon={Languages}
                onClick={() => {
                  toggleLanguage();
                  setOpen(false);
                }}
              />
```

9. Replace the sign-out block strings:

```tsx
                    <span className="block text-sm font-medium text-foreground">
                      {signOutMutation.isPending ? t("signOut.labelPending") : t("signOut.label")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("signOut.description")}
                    </span>
```

10. Add `language` to the dependency-free render (no behavior change needed beyond the toggle); the `useLanguage` hook re-renders on language change automatically. Lint may flag `language` as unused if not referenced — drop the destructure to just `{ toggleLanguage }` if so.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @petagent/ui test -- SidebarAccountMenu.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run full UI test suite**

Run: `pnpm --filter @petagent/ui test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/SidebarAccountMenu.tsx ui/src/components/SidebarAccountMenu.test.tsx
git commit -m "feat(ui): i18n migrate SidebarAccountMenu + language toggle

Replaces inline EN strings with t() calls from the sidebar namespace.
Adds a Languages MenuAction below the theme toggle that cycles
EN ↔ 中文 via LanguageContext.toggleLanguage(). Test extended to
assert the new toggle row is present.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Migrate InstanceGeneralSettings + add Language card

**Files:**
- Modify: `ui/src/pages/InstanceGeneralSettings.tsx`

This page is large; migrate top-to-bottom. After the migration, add a new "Language" section card.

- [ ] **Step 1: Add imports**

In `ui/src/pages/InstanceGeneralSettings.tsx`, add at the top alongside existing imports:

```tsx
import { useTranslation } from "react-i18next";
import { useLanguage } from "../context/LanguageContext";
```

- [ ] **Step 2: Inside the component, add the hook calls**

After `const queryClient = useQueryClient();`:

```tsx
  const { t } = useTranslation("settings");
  const { language, setLanguage } = useLanguage();
```

- [ ] **Step 3: Replace breadcrumbs**

```tsx
  useEffect(() => {
    setBreadcrumbs([
      { label: t("breadcrumb.instanceSettings") },
      { label: t("breadcrumb.general") },
    ]);
  }, [setBreadcrumbs, t]);
```

- [ ] **Step 4: Replace error toasts and loading states**

```tsx
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("signOutFailed"));
    },
```

```tsx
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("updateFailed"));
    },
```

```tsx
  if (generalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loadingState")}</div>;
  }

  if (generalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {generalQuery.error instanceof Error
          ? generalQuery.error.message
          : t("loadFailed")}
      </div>
    );
  }
```

- [ ] **Step 5: Replace the header section**

Replace the JSX block starting `<div className="space-y-2">` (around line 87):

```tsx
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("header.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t("header.subtitle")}</p>
      </div>
```

- [ ] **Step 6: Replace deployment section**

```tsx
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t("deployment.heading")}</h2>
            <ModeBadge
              deploymentMode={healthQuery.data?.deploymentMode}
              deploymentExposure={healthQuery.data?.deploymentExposure}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {healthQuery.data?.deploymentMode === "local_trusted"
              ? t("deployment.localTrusted")
              : healthQuery.data?.deploymentExposure === "public"
                ? t("deployment.authenticatedPublic")
                : t("deployment.authenticatedPrivate")}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <StatusBox
              label={t("deployment.authReadiness")}
              value={healthQuery.data?.authReady ? t("deployment.ready") : t("deployment.notReady")}
            />
            <StatusBox
              label={t("deployment.bootstrapStatus")}
              value={
                healthQuery.data?.bootstrapStatus === "bootstrap_pending"
                  ? t("deployment.setupRequired")
                  : t("deployment.ready")
              }
            />
            <StatusBox
              label={t("deployment.bootstrapInvite")}
              value={healthQuery.data?.bootstrapInviteActive ? t("deployment.active") : t("deployment.none")}
            />
          </div>
        </div>
      </section>
```

- [ ] **Step 7: Replace censor + shortcuts sections**

```tsx
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("censor.heading")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("censor.description")}</p>
          </div>
          <ToggleSwitch
            checked={censorUsernameInLogs}
            onCheckedChange={() => updateGeneralMutation.mutate({ censorUsernameInLogs: !censorUsernameInLogs })}
            disabled={updateGeneralMutation.isPending}
            aria-label={t("censor.ariaLabel")}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("shortcuts.heading")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("shortcuts.description")}</p>
          </div>
          <ToggleSwitch
            checked={keyboardShortcuts}
            onCheckedChange={() => updateGeneralMutation.mutate({ keyboardShortcuts: !keyboardShortcuts })}
            disabled={updateGeneralMutation.isPending}
            aria-label={t("shortcuts.ariaLabel")}
          />
        </div>
      </section>
```

- [ ] **Step 8: Add the new Language section directly below shortcuts**

```tsx
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("language.heading")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("language.description")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "en" as const, label: t("language.english") },
              { value: "zh" as const, label: t("language.chinese") },
            ].map((option) => {
              const active = language === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLanguage(option.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border bg-background hover:bg-accent/50",
                  )}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
```

- [ ] **Step 9: Replace backup retention section**

```tsx
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("backup.heading")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("backup.description")}</p>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("backup.daily")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {DAILY_RETENTION_PRESETS.map((days) => {
                const active = backupRetention.dailyDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    disabled={updateGeneralMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, dailyDays: days },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{t("backup.days", { count: days })}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("backup.weekly")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {WEEKLY_RETENTION_PRESETS.map((weeks) => {
                const active = backupRetention.weeklyWeeks === weeks;
                return (
                  <button
                    key={weeks}
                    type="button"
                    disabled={updateGeneralMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, weeklyWeeks: weeks },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{t("backup.week", { count: weeks })}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("backup.monthly")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {MONTHLY_RETENTION_PRESETS.map((months) => {
                const active = backupRetention.monthlyMonths === months;
                return (
                  <button
                    key={months}
                    type="button"
                    disabled={updateGeneralMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, monthlyMonths: months },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{t("backup.month", { count: months })}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
```

- [ ] **Step 10: Replace AI feedback section**

```tsx
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("feedback.heading")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("feedback.description")}</p>
            {FEEDBACK_TERMS_URL ? (
              <a
                href={FEEDBACK_TERMS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("feedback.termsLink")}
              </a>
            ) : null}
          </div>
          {feedbackDataSharingPreference === "prompt" ? (
            <div className="rounded-lg border border-border/70 bg-accent/20 px-3 py-2 text-sm text-muted-foreground">
              {t("feedback.promptHint")}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {[
              {
                value: "allowed",
                label: t("feedback.alwaysAllow"),
                description: t("feedback.alwaysAllowDescription"),
              },
              {
                value: "not_allowed",
                label: t("feedback.dontAllow"),
                description: t("feedback.dontAllowDescription"),
              },
            ].map((option) => {
              const active = feedbackDataSharingPreference === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={updateGeneralMutation.isPending}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border bg-background hover:bg-accent/50",
                  )}
                  onClick={() =>
                    updateGeneralMutation.mutate({
                      feedbackDataSharingPreference: option.value as
                        | "allowed"
                        | "not_allowed",
                    })
                  }
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("feedback.footnote", {
              key: "feedbackDataSharingPreference",
              row: "instance_settings.general",
              prompt: '"prompt"',
            })}
          </p>
        </div>
      </section>
```

- [ ] **Step 11: Replace sign out section**

```tsx
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("signOut.heading")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("signOut.description")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            <LogOut className="size-4" />
            {signOutMutation.isPending ? t("signOut.buttonPending") : t("signOut.button")}
          </Button>
        </div>
      </section>
```

- [ ] **Step 12: Verify build + typecheck pass**

Run: `pnpm --filter @petagent/ui typecheck && pnpm --filter @petagent/ui build`

Expected: PASS.

- [ ] **Step 13: Manually test in dev**

Run: `pnpm --filter @petagent/ui dev`

Open the app, navigate to `/instance/settings/general`. Verify:
- All headings/descriptions render in EN by default
- Language card shows "English" (active) and "中文"
- Click "中文" — entire page re-renders in Chinese; reload preserves choice
- Click "English" — switches back

- [ ] **Step 14: Commit**

```bash
git add ui/src/pages/InstanceGeneralSettings.tsx
git commit -m "feat(ui): i18n migrate InstanceGeneralSettings + add Language card

Replaces inline EN copy with t() calls from the settings namespace
across deployment / censor / shortcuts / backup / feedback / sign-out
sections. Adds a new Language card below the keyboard-shortcuts toggle
that lets users pick EN or 中文; selection writes to localStorage and
applies immediately via LanguageContext.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Migrate Dashboard

**Files:**
- Modify: `ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { useTranslation } from "react-i18next";
```

- [ ] **Step 2: Inside `Dashboard()`, add hook**

After existing hook calls (after `useBreadcrumbs`):

```tsx
  const { t } = useTranslation("dashboard");
```

- [ ] **Step 3: Replace breadcrumb**

```tsx
  useEffect(() => {
    setBreadcrumbs([{ label: t("breadcrumb") }]);
  }, [setBreadcrumbs, t]);
```

- [ ] **Step 4: Replace EmptyState messages**

```tsx
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message={t("welcome")}
          action={t("getStarted")}
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message={t("selectCompany")} />
    );
```

- [ ] **Step 5: Replace "no agents" warning + "Create one here"**

```tsx
            <p className="text-sm text-amber-900 dark:text-amber-100">
              {t("noAgents")}
            </p>
          </div>
          <button
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            {t("createOneHere")}
          </button>
```

- [ ] **Step 6: Replace budget incident block**

```tsx
                  <p className="text-sm font-medium text-red-50">
                    {t("budgetIncident.title", { count: data.budgets.activeIncidents })}
                  </p>
                  <p className="text-xs text-red-100/70">
                    {t("budgetIncident.summary", {
                      pausedAgents: data.budgets.pausedAgents,
                      pausedProjects: data.budgets.pausedProjects,
                      pendingApprovals: data.budgets.pendingApprovals,
                    })}
                  </p>
                </div>
              </div>
              <Link to="/costs" className="text-sm underline underline-offset-2 text-red-100">
                {t("openBudgets")}
              </Link>
```

- [ ] **Step 7: Replace MetricCard contents**

```tsx
            <MetricCard
              icon={Bot}
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label={t("metrics.agentsEnabled")}
              to="/agents"
              description={
                <span>
                  {t("metrics.agentsBreakdown", {
                    running: data.agents.running,
                    paused: data.agents.paused,
                    error: data.agents.error,
                  })}
                </span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label={t("metrics.tasksInProgress")}
              to="/issues"
              description={
                <span>
                  {t("metrics.tasksBreakdown", {
                    open: data.tasks.open,
                    blocked: data.tasks.blocked,
                  })}
                </span>
              }
            />
            <MetricCard
              icon={DollarSign}
              value={formatCents(data.costs.monthSpendCents)}
              label={t("metrics.monthSpend")}
              to="/costs"
              description={
                <span>
                  {data.costs.monthBudgetCents > 0
                    ? t("metrics.monthBudgetUsed", {
                        percent: data.costs.monthUtilizationPercent,
                        budget: formatCents(data.costs.monthBudgetCents),
                      })
                    : t("metrics.unlimitedBudget")}
                </span>
              }
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals + data.budgets.pendingApprovals}
              label={t("metrics.pendingApprovals")}
              to="/approvals"
              description={
                <span>
                  {data.budgets.pendingApprovals > 0
                    ? t("metrics.budgetOverridesAwaiting", { count: data.budgets.pendingApprovals })
                    : t("metrics.awaitingBoardReview")}
                </span>
              }
            />
```

- [ ] **Step 8: Replace ChartCard titles**

```tsx
            <ChartCard title={t("charts.runActivity")} subtitle={t("charts.last14Days")}>
              <RunActivityChart runs={runs ?? []} />
            </ChartCard>
            <ChartCard title={t("charts.issuesByPriority")} subtitle={t("charts.last14Days")}>
              <PriorityChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title={t("charts.issuesByStatus")} subtitle={t("charts.last14Days")}>
              <IssueStatusChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title={t("charts.successRate")} subtitle={t("charts.last14Days")}>
              <SuccessRateChart runs={runs ?? []} />
            </ChartCard>
```

- [ ] **Step 9: Replace recent activity / tasks sections**

```tsx
                <h3 className="font-display text-xl text-foreground/85 mb-3">
                  {t("recentActivity")}
                </h3>
```

```tsx
            <div className="min-w-0">
              <h3 className="font-display text-xl text-foreground/85 mb-3">
                {t("recentTasks")}
              </h3>
              {recentIssues.length === 0 ? (
                <div className="glass rounded-2xl p-4">
                  <p className="text-sm text-muted-foreground">{t("noTasksYet")}</p>
                </div>
```

- [ ] **Step 10: Verify build + typecheck**

Run: `pnpm --filter @petagent/ui typecheck && pnpm --filter @petagent/ui build`

Expected: PASS.

- [ ] **Step 11: Manually verify in dev**

Run: `pnpm --filter @petagent/ui dev`

Visit `/dashboard`. Switch language via the sidebar account menu. Verify all metrics, headers, and empty states change between EN and 中文.

- [ ] **Step 12: Commit**

```bash
git add ui/src/pages/Dashboard.tsx
git commit -m "feat(ui): i18n migrate Dashboard page

Replaces inline EN strings with t() calls from the dashboard
namespace. Covers breadcrumb, empty/no-agents states, budget incident
banner, all four MetricCards, four ChartCard titles, and the recent
activity / recent tasks sections.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Migrate Sidebar nav

**Files:**
- Modify: `ui/src/components/Sidebar.tsx`

The Sidebar contains many `SidebarNavItem` children with hard-coded labels. We translate the labels via `t("nav.*")`.

- [ ] **Step 1: Read the full file to identify all nav labels**

Run: `cat ui/src/components/Sidebar.tsx | grep -n 'label='`

Capture the exact list of nav items and their labels — they should match the `nav.*` keys we already wrote in `sidebar.json`.

- [ ] **Step 2: Add `useTranslation` import**

```tsx
import { useTranslation } from "react-i18next";
```

- [ ] **Step 3: Inside `Sidebar()`, add hook**

```tsx
  const { t } = useTranslation("sidebar");
```

- [ ] **Step 4: Replace each `<SidebarNavItem label="...">` literal with the matching `t("nav.<key>")` call**

For every literal label found in Step 1, replace `label="Inbox"` with `label={t("nav.inbox")}`, `label="Board"` with `label={t("nav.board")}`, etc., per the `sidebar.json` keys. Same treatment for any `<Button>` text inside the sidebar (e.g., a "New Issue" button if present).

If a literal label is missing from the JSON, add it to both `en/sidebar.json` and `zh/sidebar.json` under `nav.<key>` and use it in the JSX.

- [ ] **Step 5: Verify build + typecheck**

Run: `pnpm --filter @petagent/ui typecheck && pnpm --filter @petagent/ui build`

Expected: PASS.

- [ ] **Step 6: Manually verify in dev**

Run: `pnpm --filter @petagent/ui dev`

Sidebar should re-render in 中文 when language is switched.

- [ ] **Step 7: Commit**

```bash
git add ui/src/components/Sidebar.tsx ui/src/i18n/locales/
git commit -m "feat(ui): i18n migrate Sidebar nav labels

Routes every nav-item label through t() in the sidebar namespace.
Adds any missing keys to en/zh sidebar.json discovered during the
literal sweep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Migrate Board page

**Files:**
- Modify: `ui/src/pages/Board.tsx`
- Modify: `ui/src/components/EmployeeCard.tsx` (if it has user-visible literals)
- Modify: `ui/src/components/HireDialog.tsx` (if it has user-visible literals)
- Modify: `ui/src/components/IssueCard.tsx` (if it has user-visible literals)

- [ ] **Step 1: Read Board.tsx fully and enumerate literals**

Run: `wc -l ui/src/pages/Board.tsx` and `grep -n -E '"[A-Z][a-zA-Z ]+"' ui/src/pages/Board.tsx | head -40` to find candidate strings.

Compare against keys in `board.json`. Add any missing keys to both `en/board.json` and `zh/board.json` first if needed.

- [ ] **Step 2: Add hook**

```tsx
import { useTranslation } from "react-i18next";
```

```tsx
  const { t } = useTranslation("board");
```

- [ ] **Step 3: Replace breadcrumb + empty state + each Kanban column header + employee bar texts + drop-zone hint**

Apply the pattern from Tasks 9–11. Specifically:
- Replace `{ label: "Board" }` with `{ label: t("breadcrumb") }`
- Replace EmptyState `message` literal with `t("selectCompany")`
- Wherever Kanban column headers are rendered, use `t("kanban.todo")` / `t("kanban.inProgress")` / `t("kanban.done")`
- For the drop zone over the EmployeeBar, use `t("employeeBar.noEmployees")` if applicable

- [ ] **Step 4: Migrate Board sub-components if they have user-visible literals**

For `EmployeeCard.tsx`, `HireDialog.tsx`, `IssueCard.tsx`:
- Read each file
- Add `useTranslation("board")` hook
- Replace every user-visible literal with the matching `t("...")` call (keys are in `board.json` under `issueCard.*`, `hireDialog.*`)
- Add new keys to JSON files for any literal not already covered (mirror in EN + ZH)

- [ ] **Step 5: Verify build + typecheck + tests**

Run: `pnpm --filter @petagent/ui typecheck && pnpm --filter @petagent/ui build && pnpm --filter @petagent/ui test`

Expected: PASS.

- [ ] **Step 6: Manually verify in dev**

Visit `/board`. Switch language; verify column headers, empty states, and dialogs render in 中文 when selected.

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/Board.tsx ui/src/components/EmployeeCard.tsx ui/src/components/HireDialog.tsx ui/src/components/IssueCard.tsx ui/src/i18n/locales/
git commit -m "feat(ui): i18n migrate Board page + sub-components

Routes Board breadcrumb, empty states, Kanban column headers,
EmployeeCard, HireDialog, and IssueCard user-visible literals through
t() in the board namespace. JSON files extended with any keys
discovered during the literal sweep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: End-to-end smoke test + final verification

**Files:**
- None (manual + scripted verification)

- [ ] **Step 1: Run the full UI test suite**

Run: `pnpm --filter @petagent/ui test`

Expected: every test PASS. If any test fails because it pulls i18n indirectly without a provider, update that test to mock `react-i18next`'s `useTranslation` to return identity (`{ t: (k: string) => k }`) — or import `../i18n` to load the real bundled config.

- [ ] **Step 2: Build and typecheck the entire workspace**

Run from repo root: `pnpm build && pnpm exec tsc -b`

Expected: PASS.

- [ ] **Step 3: Run the dev server**

Run: `pnpm --filter @petagent/ui dev`

In the browser:
- **First-paint test**: clear localStorage, set browser language to English (devtools → Sensors / Languages), reload. Sidebar / Dashboard / Board should render in EN.
- **Chinese first-paint**: clear localStorage, set browser language to `zh-CN`, reload. The same pages should render in 中文 from the very first paint (no flash of EN).
- **Persistence**: switch language via account menu → reload → choice persists.
- **General Settings card**: set language via the radio in `/instance/settings/general` → sidebar updates immediately → reload → choice persists.
- **Theme default**: clear localStorage entirely, reload. The page should be light by default (white-ish background, dark text).
- **Theme persistence**: toggle to dark, reload — stays dark. Switch back to light, reload — stays light.
- **Documentation link**: open the account menu → "Documentation" → opens `https://github.com/L1l1thLY/AgentCompany` in a new tab.

- [ ] **Step 4: Sanity-check production build serves correctly**

```bash
pnpm --filter @petagent/ui build
pnpm --filter @petagent/ui preview
```

Open the preview URL and repeat the four critical flows (light default, language detection, persistence, doc link).

- [ ] **Step 5: Update CHANGELOG**

Open `CHANGELOG.md` (repo root). Under `[Unreleased]`, add:

```markdown
### Added
- Bilingual UI (English / 简体中文) with browser-language detection and an in-app toggle (sidebar account menu + Instance General Settings → Language). Phase 1 covers Sidebar, Dashboard, Instance General Settings, and Board; remaining pages migrate in Phase 2.
- Language preference persisted to `localStorage` under the key `petagent.language`.

### Changed
- The default UI theme is now light. Existing users with `petagent.theme=dark` in localStorage are unaffected; only first-time visitors and users who clear localStorage see the new default.
- Sidebar account menu Documentation link now points to the AgentCompany GitHub repo (https://github.com/L1l1thLY/AgentCompany) instead of the placeholder docs.petagent.ing URL.
```

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): record light-mode default + i18n Phase 1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review summary

**Spec coverage (cross-checked against `docs/specs/2026-05-01-light-mode-doc-link-i18n-design.md`):**

| Spec section | Implementing task |
|--------------|-------------------|
| Task 1 (light default) — `index.html` 3 spots + `ThemeContext.tsx` fallback | Task 1 |
| Task 2 (doc link) | Task 2 |
| Task 3 library choice (react-i18next + i18next + browser-languagedetector) | Task 3 |
| Directory layout (`i18n/` + `locales/<lang>/<ns>.json` + `LanguageContext`) | Tasks 4, 5, 6, 7 |
| Initial language detection (storage > navigator.zh > en) | Task 4 |
| Persistence (`petagent.language`) | Task 7 |
| Hook usage pattern (`useTranslation("ns")`) | Tasks 9, 10, 11, 12, 13 |
| Provider composition (LanguageProvider outside ThemeProvider) | Task 8 |
| UI entry points (account popover + General Settings card) | Tasks 9 (account popover), 10 (General Settings card) |
| Phase 1 sample pages (Sidebar, Dashboard, General Settings, Board) | Tasks 9 + 12 (Sidebar), 11 (Dashboard), 10 (General Settings), 13 (Board) |
| Terminology — keep tech terms in English | Reflected in zh JSON files in Task 5 |
| Tests (`detect.test.ts`, `LanguageContext.test.tsx`, page smoke renders) | Tasks 4, 7, 14 |
| First-paint correctness (no FOUC) | Task 6 (init at module-import time, before React renders) + Task 14 manual verification |

No spec section is unaddressed.

**Type consistency:** `SupportedLanguage` defined in `i18n/types.ts` and used throughout. `i18n` instance imported as `i18n` (named export) and as default; both forms reference the same module-singleton. `useLanguage()` return type is `LanguageContextValue` which exposes `{ language, setLanguage, toggleLanguage }` — matches usage in Task 9 (`{ language, toggleLanguage }`) and Task 10 (`{ language, setLanguage }`).

**No placeholders:** every step shows the exact code or command. The migration tasks (12, 13) include a "literal sweep" step rather than enumerating every label by hand because the engineer must read the file to find them; the matching keys are pre-defined in JSON, and the migration pattern is shown via Tasks 9 and 10.
