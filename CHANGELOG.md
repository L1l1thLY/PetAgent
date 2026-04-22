# Changelog

PetAgent 的所有重要变更都记录在这里。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。

## [Unreleased] — M1 进行中

里程碑 1（M1）"Agent 家族 + Psychologist + Plugin 架构"分组实施中。当前已完成 Group 1-10；Group 11（V1 范围拉回 spec 对齐）与 Group 12（Web UI 全套改造）尚未开始。完整 v0.2.0-m1 tag 会在 Group 11 + 12 全部 ship 后再打。

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

### 已记录的 M1 范围内待办

- Group 11（V1 范围拉回，10 tasks）：Per-Role MCP 集成（spec §3.8）、Per-Role Hooks session 生命周期（§3.9）、Hybrid Team Coordinator SKIP Reviewer 逻辑（§3.4）、Transparency γ 可配置化（§7.4 / §17.4）、Worker built-in starter skills（§11）、Role Template FS Watcher 热加载（§20）、Secrets 加密存储（§16.1）、`petagent setup` 向导（§14.2）、`petagent status`、`petagent import <template>`（§15）。
- Group 12（Web UI 全套改造，6 tasks）：Board 主视图改造（员工栏 + Issue 对话流，§17.1）、拖拽招人（§17.2）、角色面板（§17.3）、情绪介入透明面板（§17.4）、通知中心（§17.6）、邮件通道 + Budget 阈值告警（§18.1）。
- Psychologist concrete 实现（drizzle-backed `BehavioralRecordsStore` + `IncidentStore` + Anthropic-backed `ClassifierTransport` + `PsychologistActions` 接 server agent API）—— Group 7 仅 ship 端口接口，concrete 落地排在 Group 11/12 之后或 M2。
- M1 真 E2E：Group 9 Task 50 用合成烟测替代（覆盖完整 psych 干预链 + cooldown + 恢复/升级），真 server-driven E2E 待 concrete 实现完成后补。

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
