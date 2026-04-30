# AgentCompany：PetAgent

> 一个人，一家 AI 公司 —— 有温度地经营，让员工持续进化。

**PetAgent 不是另一个 agent 编排框架**。它是给 **1 人创业者 / solo developer** 的一整套"AI 公司操作系统"：你是 CEO，6 个内置 role 模板（Coordinator / 4 类 Worker / Psychologist）就是你的初始员工。你发任务、看进度、看预算、看情绪 —— 他们替你拆解、执行、复盘、互相协作；卡住了由 Psychologist 介入抚慰；做完了由 Reflector 写下经验；每周由 SkillMiner 把反复发生的 patterns 提炼成新 skill 让团队整体变强。

需要外援？Claude Code / Codex / Cursor / OpenClaw / Hermes 等 8 种主流外部 agent 同一块看板协作 —— 把它们当外包实习生，正式员工还是你自己的 PetAgent 家族。

## 核心特性

**👥 像 CEO 一样招人**
- **6 内置 role**，点几下就上岗：Coordinator（拆 Goal 为 Issue）/ Explorer / Planner / Executor / Reviewer / Psychologist
- **拖拽招人**：Role Palette 面板上托一下角色卡，员工就到位 —— 头像栏看得见、可点开看 instruction
- **混合编队不割裂**：PetAgent 原生 agent + 8 种外部 adapter（Claude Code / Codex / Cursor / OpenClaw / OpenCode / Pi / Hermes / Gemini）同一队伍

**🎯 像 CEO 一样发活**
- **Chat Bar**：直接跟 Coordinator 说话，它帮你拆 Goal、派给合适的 Worker
- **Company / Goal / Issue 三层**：组织目标 → 可执行 issue → 员工领取
- **预算 + 审批治理**：每次 LLM 调用成本可见，70/90/100% 阈值告警 + 邮件，敏感操作必须审批

**❤️ 像 HR 一样照顾员工**
- **Psychologist 子系统**：监听全员情绪状态，卡住时自动注入抚慰 prompt 或暂停任务（不是花俏功能 —— 这是有[同行评议研究](#为什么是有温度的-ai-公司学术依据)支撑的设计）
- **透明介入面板**：每次干预都有 audit log，你随时可看、可关、可调严苛度
- **不只对自家员工管用**：归一化 Hook 总线让 Psychologist 也能干预外部 adapter

**📚 像 CTO 一样让团队进化**
- **Notes 记忆层**：每次 heartbeat 写一条反思（templated 或 Haiku-backed），pgvector 语义检索按意义召回（不是关键词）
- **SkillMiner 周批**：上周所有 notes 喂给 LLM 找 ≥3 次重复的 patterns，提炼成 Skill 候选 —— 你只批不写
- **KPI 比较器 + Auto-Rollback**：Trial skill 用了一段时间成功率不达标自动 retire，30 天没用过的自动归档
- **项目记忆 git sync**：notes + skills 自动 push 到你的私有 git remote，跨机器跨时间都在

**🛠️ 完整 CLI + 全套 UI**
- **CLI**：`petagent hire / notes / audit / secrets / status / setup / doctor / open`
- **UI**：Board 员工头像栏 · 拖拽招人 · 角色面板 · 情绪介入透明面板 · 通知中心 · /notes 浏览 · Skill Candidates / Weekly Digest / LLM Providers 设置页
- **多 LLM provider**：8 内置 preset（Anthropic / OpenAI / Kimi / Minimax / DeepSeek / GLM / Gemini / Minimax-CN），首次启动 30 秒配完

## **情绪 prompt 干预能让 LLM 实际工作得更好**

| 研究（按发表时间倒序） | 结论 | 在 PetAgent 里对应 |
|---|---|---|
| **EvoEmo** ([Long et al., Cambridge, 2025-09](https://arxiv.org/abs/2509.04310)) | 把 LLM agent 的情绪建模成 7 维状态空间（anger / disgust / fear / happiness / sadness / surprise / neutral）+ Markov 决策过程，证明**情绪态切换不是装饰，是改变 agent 任务表现的可学习策略**。在多轮谈判任务上 EvoEmo agent 接近 100% 成功率，远超 emotion-free baseline。 | Psychologist 的 6 信号分类器（frustration / low_confidence / confusion / over_cautious / giving_up / angry）就是这个 7 维空间的简化。`emotional_incidents` 表持久化每次状态转移 → 跟 EvoEmo 把情绪建模成 MDP 同源。 |
| **Where LLM Agents Fail and How They Can Learn From Failures**（AgentDebug） ([Liu et al., 2025-09](https://arxiv.org/abs/2509.25370)) | 提出 AgentErrorTaxonomy + AgentDebug 框架，**专门检测 + 介入 cascading failure（一个根因错误层层传染）**。在 ALFWorld / GAIA / WebShop 上让 agent 通过定向反馈**自我恢复，task success 相对提升 +26%**。 | PetAgent 的 BehaviorMonitor → Classifier → InterventionDispatcher 链路就是 AgentDebug 那套"检测根因 → 注入纠偏反馈" 的产品化版本。`MODERATE_PROMPT` 直接对应论文里的"corrective feedback that breaks cascade"。 |
| **The Intervention Paradox** ([2026-02](https://arxiv.org/abs/2602.03338)) | 反向警告：**高准确率的 critic 模型 ≠ 干预有效**，盲目介入有时会让 agent 表现下降 26 个百分点。"恢复本会失败的轨迹" vs "扰乱本会成功的轨迹" 是 trade-off。 | 解释了为什么 PetAgent 必须给用户透明面板 + γ 严苛度滑杆 + 一键关闭 —— 介入不是越多越好。spec §7.4 把 mild / moderate / severe 三档分开，让用户自己定阈值，正是为了对冲这个悖论。 |
| **SAGE: Self-evolving Agents with Reflective and Memory-augmented Abilities** ([Liang et al., 2024-09](https://arxiv.org/abs/2409.00872)) | 反思机制 + 基于 **Ebbinghaus 遗忘曲线** 的记忆优化。在闭源模型上提升 **2.26 倍**，开源小模型上 +57.7%~+100%。证明 agent 也需要"主动遗忘旧经验"，不是攒得越多越好。 | Reflector 写 Notes 是 SAGE 的反思半边；M2 G4 Phase G 的 auto-archive routine（30 天没用的 trial skill 自动 retire）就是 Ebbinghaus 遗忘曲线在 skill 层的落地。**有温度也包括"放下"**。 |

> 学界 2024-2026 年的共识 —— LLM agent 是一个有情绪状态、会陷入认知 cascade、会被语言干预改变表现、需要遗忘机制才能持续运转的 **准心智系统**。把它当冰冷工具就是浪费它的能力上限；像照顾员工一样运营它，**有产出回报，不是浪漫主义**。

Sources:
- [EvoEmo: Towards Evolved Emotional Policies for Adversarial LLM Agents in Multi-Turn Price Negotiation (Long et al., Cambridge, 2025, arXiv:2509.04310)](https://arxiv.org/abs/2509.04310)
- [Where LLM Agents Fail and How They Can Learn From Failures (Liu et al., 2025, arXiv:2509.25370)](https://arxiv.org/abs/2509.25370)
- [The Intervention Paradox: Accurate Failure Prediction in Agents Does Not Imply Effective Failure Prevention (2026, arXiv:2602.03338)](https://arxiv.org/abs/2602.03338)
- [SAGE: Self-evolving Agents with Reflective and Memory-augmented Abilities (Liang et al., 2024, arXiv:2409.00872)](https://arxiv.org/abs/2409.00872)

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
| **M2 G4 Full** Skill 自进化（完整） | Weekly Digest UI + `mining_runs` 表（Phase F）/ 自动归档 routine（Phase G）/ Shadow Mode `skill_invocations` 表 + repo（Phase H）/ KPI 比较器 + Auto-Rollback routine（Phase I）/ 项目记忆 git sync（Phase J） | ✅ 2026-04-27（v0.7.0-skill-evolution-full） |
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
