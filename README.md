# PetAgent

> 开源 AI 员工平台 —— 协调并让你的 AI 公司自进化。

**PetAgent** 是一个管理 AI 员工的开源平台。它不只是 agent 编排——它还**内置了一个会自进化、带心理疗愈师的 AI 员工家族**，可以和你的 Claude Code / Codex / OpenClaw / Hermes 等外部 agent 在同一块看板上协作。

## 🙏 特别感谢 Paperclip

PetAgent 站在 [Paperclip](https://github.com/paperclipai/paperclip) 的肩膀上。

Paperclip 是一个优秀的开源 AI agent 编排平台（MIT License），为 PetAgent 提供了完整的控制平面底座：Company / Goal / Issue / Board 模型、8 个内置 adapter（claude_local, codex_local, cursor, openclaw_gateway, opencode_local, pi_local, hermes_local, process, http）、预算与审批治理、Routines 定时任务、Heartbeat 队列、Adapter 热加载系统。没有 Paperclip 团队的工作，PetAgent 的 M0 里程碑不可能在一天内完成。

PetAgent 在 Paperclip 基础上增加一层"自进化 AI 员工 + 心理疗愈"的差异化能力，同时完整保留 Paperclip 的所有功能与 API 兼容性。感谢 Paperclip 维护者们选择 MIT 协议 —— 这让 PetAgent 这样的衍生项目得以存在。

> **向 Paperclip 团队致敬。** 💙

## 核心特性

继承自 Paperclip（未改动）：

- **异构 Agent 编排**：一个 Board 上并行指挥 Claude Code、Codex、Cursor、OpenClaw、Hermes 等外部 agent
- **Company / Goal / Issue 三层模型**：组织目标 → 可执行 issue → agent 领取
- **预算与审批治理**：每次 API 调用成本可见、敏感操作需审批
- **Routines 定时任务**：cron 式触发，支持 heartbeat 队列
- **Plugin 热加载**：外部 adapter 无需重启即可上线

PetAgent 自有：

- **PetAgent 员工家族**：Coordinator / Worker（Explorer、Planner、Executor、Reviewer）/ Psychologist —— 覆盖从分解目标到执行到验收的完整链路；内置 6 个 role 模板可直接 hire
- **心理疗愈子系统**：持续监听 agent 情绪状态、在情绪类卡住时自动注入抚慰 prompt 或暂停任务，避免长时停摆。透明面板可审计每次干预
- **Notes 记忆层**：agent 每次 heartbeat 写一条反思笔记（templated 或 Haiku-backed），pgvector 余弦检索按语义召回历史经验
- **三种身份 Agent**：PetAgent 原生 + 现成的 8 种外部 adapter，混合编队没有割裂感
- **全套招人心智 UI**：Board 员工头像栏 · 拖拽招人 · 角色面板 · 情绪介入透明面板 · 通知中心 · 与 Coordinator 直接对话的 Chat Bar · /notes 浏览
- **CLI 完整**：`petagent hire`、`petagent notes`、`petagent audit`、`petagent secrets`、`petagent status`、`petagent setup`、`petagent doctor`、`petagent open`

## 快速上手

```sh
# 一键 onboard（推荐第一次用）
npx petagentai onboard --yes

# 后续启动
npx petagentai run

# 在浏览器打开 Board
npx petagentai open
```

启动后默认 UI 在 http://localhost:3100。

### 启用 Psychologist + Reflector + 真 LLM 后端

PetAgent 支持 **多 LLM provider**（M2 G3，灵感来自 Hermes Agent）。两种配置方式：

**方式 A：ENV-only（最简）** —— 适合只用 Anthropic + OpenAI 的场景

```sh
# 让 Psychologist 跑起来（行为-only 模式，不需要 key）
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run

# 加 Anthropic key 升级到 Haiku 分类器 + Haiku 反思 builder
ANTHROPIC_API_KEY=sk-ant-... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run

# 再加 OpenAI key 切到真 embedding
ANTHROPIC_API_KEY=sk-ant-... \
OPENAI_API_KEY=sk-... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run
```

**方式 B：UI 配置（最推荐，v0.5.1+）**

启动后浏览器进 `http://localhost:3100`，Board 顶部会看到蓝色引导条 "Set up an LLM provider"。点 **Configure** → 弹窗里：选 preset（默认 Kimi）→ 粘贴 key → 勾选要启用的子系统 → Save。

要后续修改、加多个 provider，去 **Instance Settings → LLM Providers**（侧边栏的钥匙图标）。

**方式 C：YAML 手写（power user）**

```sh
# 1. 复制模板
cp petagent.config.yaml.example petagent.config.yaml

# 2. 编辑 providers + llm_routing；minimal Kimi-only 示例：
cat > petagent.config.yaml <<'EOF'
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
llm_routing:
  psychologist: my-kimi
  reflector: my-kimi
  embedding: my-kimi
EOF

# 3. 启动（key 通过 env 注入，不要写到 yaml 里）
KIMI_API_KEY=sk-moonshot-... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run
```

支持 8 个内置 preset：`anthropic`, `openai`, `kimi`, `minimax`, `minimax-cn`, `deepseek`, `zai` (GLM), `gemini`。详见 [petagent.config.yaml.example](./petagent.config.yaml.example) 和 [docs/user-manual.md](./docs/user-manual.md#多-llm-provider-配置)。

启动日志确认实际生效模式：

```
[petagent] llm-router: psychologist → my-kimi (openai_chat, moonshot-v1-32k) [config]
[petagent] llm-router: reflector → my-kimi (openai_chat, moonshot-v1-32k) [config]
[petagent] llm-router: embedding → my-kimi (openai_embeddings, moonshot-v1-embedding) [config]
[petagent] psychologist started (classifier=prompted)
[petagent] reflector started (builder=haiku)
[petagent] embedding service mode: kimi
```

ENV-only 模式日志中 `[config]` 替换为 `[env-fallback]`。

### 邮件告警 + budget 检查

```sh
PETAGENT_BUDGET_CHECK_ENABLED=true \
SMTP_HOST=smtp.example.com \
SMTP_PORT=587 \
SMTP_USER=alerts \
SMTP_PASSWORD=... \
SMTP_FROM=alerts@petagent.local \
SMTP_TO_ADMIN=admin@example.com,ops@example.com \
npx petagentai run
```

70% / 90% / 100% 阈值触发 Console + 通知中心 + （可选）邮件。

## 状态

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M0** Paperclip Distro | Fork + 全套 rebrand + 分发骨架 | ✅ 2026-04-19（v0.1.0-m0） |
| **M1** PetAgent 家族 + Psychologist + Plugin 架构 | 6 内置 role / Psychologist 子系统 / Hook Bus / Safety Net / Skills 包 / Templates 包 / 全套 UI 改造 | ✅ 2026-04-23（v0.2.0-m1） |
| Post-M1 wiring | Psychologist concrete adapters / SkipReviewer helper / role-template watcher / NotificationStore bridge / budget-check routine / NotificationBell / SMTP / MCP+Hook runtime glue | ✅ 2026-04-26 |
| **M2 Preview** | Notes 层 (CRUD+pgvector+CLI) / LLM Reflector + context enrichment / 真 OpenAI embedding API / Psychologist auto-start / Reflector auto-start / /notes UI / Chat Bar | ✅ 2026-04-26（v0.3.1-m2-alive） |
| **M2 G3** 多 LLM Provider Registry | Hermes-style 三层架构（wire-protocol transport + preset registry + YAML routing config）/ 8 内置 preset (anthropic/openai/kimi/minimax/minimax-cn/deepseek/zai/gemini) / per-subsystem 路由 / ENV-only BC fallback | ✅ 2026-04-26（v0.5.0-multi-provider） |
| **M2 G3 UI** | Settings → LLM Providers 页面（增删改 provider + 路由）/ 首页弹窗引导（首次进入 30 秒搞定）/ 后端 GET/POST `/instance/settings/llm-providers` / 自动写 yaml + .env (chmod 600) | ✅ 2026-04-26（v0.5.1-ui-config） |
| **M2 G4 MVP** Skill 自进化（核心闭环） | `@petagent/skill-miner` 包 / `skill_candidates` 表 / 周批 routine + Run-Now 按钮 / Approve→trial Skill 提升 / Sidebar "Skill Candidates" 页面 | ✅ 2026-04-27（v0.6.0-skill-miner-mvp） |
| **M2 G4 Full** Skill 自进化（剩余） | Shadow Mode / KPI + Auto-Rollback / Weekly Digest UI / 项目记忆 git sync / 自动归档 | 🚧 计划中 |
| **M3** 代码架构自升级 | agent-writes-plugin / Shadow 协调器 / KPI 比较器 / 金丝雀 | ⏸ 架构就绪后启动 |

## 文档

- 用户使用手册：[docs/user-manual.md](./docs/user-manual.md)
- 快速上手：[docs/start/quickstart.md](./docs/start/quickstart.md)
- 架构概览：[docs/start/architecture.md](./docs/start/architecture.md)
- 核心概念：[docs/start/core-concepts.md](./docs/start/core-concepts.md)

## License

基于 [Paperclip](https://github.com/paperclipai/paperclip)（MIT）fork，PetAgent 自身也采用 **MIT License**。

- 完整 MIT 文本见 [LICENSE](./LICENSE)
- 第三方项目 attribution 见 [NOTICES.md](./NOTICES.md)
- 原 Paperclip README 归档在 [README.paperclip-origin.md](./README.paperclip-origin.md)

## 致谢

- **[Paperclip](https://github.com/paperclipai/paperclip)**（MIT, paperclipai） —— 提供底层控制平面，PetAgent 的直接 fork 基底
- **[Hermes Agent](https://github.com/NousResearch/hermes-agent)**（MIT, Nous Research） —— Skill 系统 port 来源（spec §13.2）
- **[Claude Code](https://claude.com/claude-code)**（Anthropic） —— 多 agent 架构灵感来源（仅架构借鉴，未 port 代码）

特别鸣谢所有 Paperclip contributors —— 你们的工作让 PetAgent 成为可能。
