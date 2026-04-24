# Changelog

PetAgent 的所有重要变更都记录在这里。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。

## [0.2.0-m1] - 2026-04-23

里程碑 1（M1）"Agent 家族 + Psychologist + Plugin 架构 + V1 UI 改造" 完成。全部 68 个 task ship；累计新增 ~518 个单测全绿；工作区 1922/2039 pass（4 个失败均为 M0 固有 embedded-postgres 并发初始化竞态 + worktree 5s 文件系统超时，与 M1 改动无关）。

### 新增包

- `@petagent/hooks` — `HookBus` 过滤调度 + 错误隔离；server `publishLiveEvent` → `HookBus` 转发。
- `@petagent/safety-net` — `fuzzyFindAndReplace`（9 策略中已实现 6 条）、`scanForThreats`（121 条威胁模式中 15 条 + 全部 17 个不可见字符）、`validateWithRegexOnly` + `validateWithLLM` 两层编排、`GitStore`（isomorphic-git 后端）。
- `@petagent/skills` — Hermes MIT port：`parseFrontmatter`、`isSkillActivated`（platforms/requires/fallback）、`SkillManager` + `SkillRepository`、`LruCache`（L1 tier；L2/L3 延后到 M2）、`parseSaveAsSkill`。
- `@petagent/role-template` — Zod `RoleTemplateSchema`、`RoleTemplateLoader` 多源优先级（user > project > plugin > built-in）。
- `@petagent/my-agent-adapter` — `PetAgentPlugin` 接口、`PluginRegistry` + `RouteLookup`、3 种 `AgentRuntime`（managed_agents / local_process / worktree，依赖注入）、`PetAgentAdapter` 主体、`generateDefaultName`（spec §3.3 pronounceable pool）、可选 `PreventivePromptSource` 注入失败模式 suffix 到 `roleTemplate.prompt`。
- `@petagent/psychologist` — Ports-and-adapters 设计（单测不依赖 DB / Anthropic SDK）。`BehaviorMonitor`（3 信号 mean-2σ）、`PromptedClassifier`（CLASSIFIER_PROMPT + transport seam）、`craftIntervention`（severity × signals 纯函数）、`InterventionDispatcher`（severe→pause / moderate→inject+comment / mild→inject + capability fallback）、`Psychologist` 主循环（HookBus 订阅 + cooldown gate）、`OutcomeTracker`（heartbeat.ended → recovered/escalated）、`getPreventiveSuffix`（top-3 失败模式）。
- `@petagent/templates` — 3 个 starter 模板按 agentcompanies/v1 markdown 包格式（spec §6 + `docs/companies/companies-spec.md`）：`solo-pack`（3 agents）、`small-dev-team`（8 agents + engineering TEAM.md）、`hybrid-team`（6 agents 含 2 个 `claude_local` 外部 executor，README 解释 double-review 语义）。

### 内置 Role 模板

`packages/my-agent-adapter/built-in-roles/` 下 6 个 markdown：`coordinator` / `worker-explorer` / `worker-planner` / `worker-executor` / `worker-reviewer` / `psychologist`。每个声明 `roleType` / `tools` / `disallowedTools` / `isolation` / `structured_output_protocol`，self-evolution 段照 Hermes `prompt_builder.py` L.790-792 精神 port（`skill_view` / `skill_manage` / `@save-as-skill`）。

### CLI 新增命令

- `petagent hire --role <roleType>` — 自动命名（pronounceable pool first，fallback `Worker-N`）。
- `petagent health -C <companyId>` — 聚合 agents + heartbeat_runs + emotional_incidents。
- `petagent audit emotional-interventions` — 按 classification / outcome / intervention kind 分桶。

### Server 新增端点

- `GET /api/companies/:companyId/emotional-incidents?sinceDays=&limit=&agentId=` — Psychologist 干预审计读路径。

### Database

- Migration 0058（drizzle-generated）—— `agent_skills` + `agent_skill_subscriptions`、`agent_notes` + `agent_issue_sessions`、`emotional_incidents`、`petagent_plugins` + `petagent_plugin_routes` + `kpi_samples` + `pgvector` 扩展。

### 测试

`pnpm exec vitest run` 累计 1671/1788 通过；M1 新增 ~213 个单测全绿。4 个 fail 全部是 M0 固有的 embedded postgres 并发初始化竞态 + worktree 5s 文件系统超时，与 M1 改动无关。

### 合规

- `NOTICES.md` 加 Hermes MIT attribution 表（按文件标注 port 范围）+ Hermes LICENSE 全文。
- Claude Code 架构借鉴声明保留（spec §13.6）；未 port 任何代码。

### V1 范围拉回（Group 11）

- Per-Role MCP (§3.8) —— `McpManager` 端口 + `StaticMcpServerRegistry` + 严格/宽松模式；`mcpServers` schema 收紧到 `string[]`。
- Per-Role Hooks session 生命周期 (§3.9) —— `SessionHookManager` + `HookCommandRunner` 端口；四事件 on_start/after_tool_use/before_stop/on_error；错误隔离。
- Hybrid Team Coordinator SKIP Reviewer (§3.4) —— `capabilities.ts` + `shouldSkipReviewer`；Coordinator 提示更新。
- Transparency γ 可配置化 (§7.4) —— opaque/semi/transparent 三档；backend redaction + UI toggle。
- Worker built-in starter skills (§11) —— 13 条 SKILL.md + role template 预填。
- Role Template FS Watcher (§20) —— chokidar + debounce + `role.template_changed` hook event。
- Secrets 加密存储 (§16.1) —— `@petagent/secrets` 新包：AES-256-GCM + scrypt 主密钥派生 + optional keytar + `PreferredSecretsStore`；CLI `petagent secrets set/get/delete/list/rotate`。
- CLI 命令：`petagent setup` 交互式向导 (§14.2)、`petagent status` 今日摘要 (§15)、`petagent import <template>` (§15)。

### Web UI 全套改造（Group 12，§17）

- Board 主视图 (§17.1) —— `/board` 页：EmployeeBar 按 role 分组 + 三栏 Kanban + IssueCard 含 ⚠️ 连续失败标记 + ToolUseEmoji 映射（💭/📖/✍️/🔧/💡/⏸️ 等）+ 角色头像（🎯/🔎/🗺️/⚙️/🧪/🧠）。
- 拖拽招人 (§17.2) —— `RolePalette` 可拖拽 role 卡 + `HireDialog` 表单（Name/Model/Budget/Isolation/Skills/ReportsTo）；DataTransfer 用 `application/x-petagent-role` MIME。
- 角色面板 (§17.3) —— `/roles` 页按 source 分组（built-in / plugin / project / user，联动 §3.10 优先级）、prompt 预览、tools/disallowed/skills/mcp 显示；New-role textarea（V1 只读反馈，V2 加写路径）。
- 情绪介入透明面板 (§17.4) —— `/interventions` 页时间轴 + 按 agent/severity/outcome 过滤 + 搜索 + CSV 导出；响应 server-side γ 透明度 redaction。
- 通知中心 (§17.6) —— `NotificationBell` 顶栏铃铛 + 下拉列表 + 30s 轮询；后端 `InMemoryNotificationStore` + pure `classifyHookEvent` + `classifyBudgetAlert`；DB 持久化 impl 推迟到 post-M1。
- 邮件通道 + Budget 阈值告警 (§18.1) —— `evaluateBudgetThresholds` 纯函数 + 70%/90%/100% 三档 + `BudgetAlertNotifier` 端口 + `runBudgetAlertCycle`；nodemailer SMTP 发件器 + auto-pause 留 post-M1 wiring。

### 已记录的 post-M1 wiring pass 待补

- Psychologist 端口的 concrete 实现：drizzle-backed `BehavioralRecordsStore` + `IncidentStore` + Anthropic-backed `ClassifierTransport` + `PsychologistActions` wired to server agent API（Group 7 仅 ship 端口接口；Group 9 Task 50 用合成烟测替代真 E2E，真 E2E 要在 concrete stores 落地后补）。
- `McpManager` / `SessionHookManager` 接入 3 种 runtime（managed_agents / local_process / worktree）的 glue（Group 11 Task 53 + 54 仅 ship 端口）。
- Coordinator Router plugin 调用 `shouldSkipReviewer(executorAgentId, lookup)` 分支（Group 11 Task 55 仅 ship 能力查询 helper）。
- role-template watcher 起来后向 HookBus 发 `role.template_changed` 事件（Group 11 Task 58 watcher 有 emit，HookBus 转发是 M1 end 未做）。
- CLI `petagent import` 的 reportsTo 二次 patch（需要 slug→UUID 解析回写）。
- `NotificationStore` drizzle-backed impl + DB migration + HookBus → notifications 订阅器（Group 12 Task 67 仅 ship 端口 + 内存实现 + 纯函数 classifier）。
- `BudgetAlertNotifier` 的 nodemailer-backed SMTP 实现 + `budget-check` 定时 routine + 100% 阈值 auto-pause 所有 issue（Group 12 Task 68 仅 ship evaluator + 端口）。
- `role-template` watcher 文件更新后 UI 实时刷新（Task 58 server-side watcher ok；UI /roles 页当前靠 query staleTime）。
- `NotificationBell` 组件实际嵌入 AppShell header（当前只建好组件未挂载）。

## [Unreleased]

## [0.1.0-m0] - 2026-04-19

### 里程碑 0：Fork 与重命名

- 从 Paperclip upstream fork
- 所有 `@paperclipai/*` 包重命名为 `@petagent/*`
- CLI 可执行名重命名：`paperclipai` → `petagent`
- UI 品牌字样更新："Paperclip" → "PetAgent"；`.paperclip/` data dir → `.petagent/`
- PAPERCLIP_\* 环境变量全部重命名为 PETAGENT_\*
- Docker 镜像 / quadlet 容器名更新：`paperclip/*` → `petagent/*`
- skills 目录重命名：`skills/paperclip*` → `skills/petagent*`
- 新增 `petagent open` 命令（spec §15）
- 分发打包骨架就位：Homebrew formula 草稿、PowerShell bootstrap、pkg 单文件 binary 构建脚本、release workflow
- 全新 README，定位为 PetAgent
- 新 NOTICES.md 用于第三方 attribution
- GitHub Actions CI：typecheck、lint、test、build
- M0 端到端烟测通过（claude_local adapter 工作正常）

### 继承自 Paperclip（未改动）

- Company / Goal / Issue / Board 模型
- 8 个内置 adapter：claude_local、codex_local、cursor、openclaw_gateway、opencode_local、pi_local、hermes_local、process、http
- 预算与审批治理
- Routines 定时任务
- Heartbeat 队列
- Adapter 热加载系统
