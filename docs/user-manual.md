# PetAgent User Manual

> 适用版本：v0.5.0-multi-provider 起（含 v0.3.1-m2-alive / v0.4.0-pre-m2 全部能力）。本手册覆盖 M0 + M1 + M2 Preview + M2 G3 全部已发布功能。

## 目录

1. [安装与启动](#1-安装与启动)
2. [核心概念：Company / Goal / Issue / Agent](#2-核心概念companygoalissueagent)
3. [Hire 招人](#3-hire-招人)
4. [角色家族（Coordinator / Worker / Psychologist）](#4-角色家族)
5. [使用 Board](#5-使用-board)
6. [Chat Bar：与 Coordinator 对话](#6-chat-bar)
7. [Notes 反思笔记](#7-notes-反思笔记)
8. [Psychologist 情绪疗愈](#8-psychologist-情绪疗愈)
- [多 LLM Provider 配置](#多-llm-provider-配置) ← Kimi / Minimax / DeepSeek / GLM / Gemini
- [Skill 自进化（M2 G4 MVP）](#skill-自进化m2-g4-mvp) ← v0.6.0+
9. [Budget 与告警](#9-budget-与告警)
10. [CLI 完整命令](#10-cli-完整命令)
11. [环境变量参考](#11-环境变量参考)
12. [外部 Adapter（Claude Code / Codex / 等）](#12-外部-adapter)
13. [常见问题排查](#13-常见问题排查)

---

## 1. 安装与启动

### 第一次使用

```sh
npx petagentai onboard --yes
```

走完交互后默认 UI 在 http://localhost:3100。

### 后续启动

```sh
npx petagentai run
```

### 启用全套智能能力

PetAgent 的 Psychologist 和 Reflector 默认 **disabled**（保持纯 Paperclip 行为）。打开它们：

```sh
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run
```

需要真 LLM 反思时再加 key：

```sh
ANTHROPIC_API_KEY=sk-ant-... \
OPENAI_API_KEY=sk-... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run
```

要用 Kimi / Minimax / DeepSeek / GLM / Gemini 等其它 provider，看本手册 [§9 多 LLM Provider 配置](#9-多-llm-provider-配置)。

启动日志会确认：

```
[petagent] llm-router: psychologist → _bc_anthropic (anthropic_messages, claude-haiku-4-5-20251001) [env-fallback]
[petagent] llm-router: reflector → _bc_anthropic (anthropic_messages, claude-haiku-4-5-20251001) [env-fallback]
[petagent] llm-router: embedding → _bc_openai (openai_embeddings, text-embedding-3-small) [env-fallback]
[petagent] psychologist started (classifier=prompted)
[petagent] reflector started (builder=haiku)
[petagent] embedding service mode: openai
```

`classifier=passthrough` 表示无 ANTHROPIC_API_KEY 时的行为-only fallback，仍能 fire 介入但不调 LLM。`builder=templated` 表示 Reflector 写模板反思而非 LLM 反思。`embedding service mode: stub` 表示 Notes 用 SHA-256 deterministic stub（语义检索仅作开发用）。`[env-fallback]` 表示是 ENV-only 模式；写 YAML 配置后会变成 `[config]`。

### 验证

```sh
npx petagentai doctor      # 健康检查
npx petagentai status      # 当前公司任务摘要
npx petagentai open        # 浏览器打开 Board
```

---

## 2. 核心概念：Company / Goal / Issue / Agent

继承自 Paperclip：

- **Company** — 一个独立工作空间。可以有多个公司并存，每个公司有自己的 Board / agents / 预算。
- **Goal** — 公司级长期目标，CEO 在此分解。
- **Issue** — 可执行单元。assigneeAgentId 指向某个 agent。状态：`backlog → todo → in_progress → in_review → done`（或 `blocked` / `cancelled`）。
- **Agent** — AI 员工。有 role（PetAgent native）/ adapterType / 月度 budget / 历史成本。
- **Project** — issue 容器；按项目分组。

PetAgent 增补：

- **Issue Document** — issue 上挂载的文档（`plan` / `notes` / 自定义 key），有 revision 历史。
- **Note** — agent 写的反思笔记（M2）。可按语义检索。
- **Emotional Incident** — Psychologist 检测到的行为信号 + 干预记录。

---

## 3. Hire 招人

### CLI

```sh
# 招一个 Coordinator
petagent hire --role coordinator --company-id <id>

# 招一个 Executor 起名 Bob，月预算 $30
petagent hire \
  --role worker/executor \
  --company-id <id> \
  --name Bob \
  --budget-usd 30

# 列出所有可用 role
petagent hire --help
```

支持的 `--role`：
- `coordinator`
- `worker/explorer` `worker/planner` `worker/executor` `worker/reviewer`
- `psychologist`

### UI

在 `/board` 页面：

- 左侧"角色面板"列出所有可用 role（按来源分组：built-in / project / user）
- 拖一张卡到中央画布弹出 HireDialog 填表（Name / Title / Reports To / Budget / Adapter Type）

`--budget-usd` 不传时默认 0（不限）。

### 复用同一 role 招多个

OK 的。命名约定：默认会自动给名字（first roles 用 role-default 名字，重复时进入"pronounceable pool" → 最终 Worker-N fallback）。

---

## 4. 角色家族

PetAgent 的 6 个内置 role 定义在 `packages/my-agent-adapter/built-in-roles/*.md`：

| roleType | 用途 | tools 倾向 | structured output |
|---|---|---|---|
| **coordinator** | 唯一一个；分解 goals → 路由 issue 给 worker；不执行 | Read / Write / TaskCreate / TaskUpdate | summary |
| **worker/explorer** | 调研 + 探索；找上下文 | Read / Bash / Grep / WebSearch | findings |
| **worker/planner** | 把已知信息 → 实施 plan | Read / Write | critical_files |
| **worker/executor** | 实际写代码 / 改文件 | Read / Edit / Write / Bash | summary |
| **worker/reviewer** | 验收 / 双重确认 | Read / Bash | verdict |
| **psychologist** | 监听情绪信号 + 介入；不接任务 | （仅注入抚慰 prompt 到目标 agent）| - |

每个 role 的 prompt + tools + skills 在对应 md 中可读可改。改动后 server FS Watcher 自动 reload，正在跑的实例不打断（下次 session 生效）。

---

## 5. 使用 Board

`/board` 页面（前提：选了某个公司）：

- **顶部 ChatBar** — 与 Coordinator 对话，回车发送（见 §6）
- **EmployeeBar** — 当前公司全部 agent 头像，按 role 分组；Idle / Busy / Listening 三态
- **三栏 Kanban** — Todo / In Progress / Done
  - 每个 IssueCard 显示：assignee 头像、tool_use emoji（🔧 Read/Write/Bash · 💭 思考）、连续失败 ⚠️ 视觉
- **左侧 RolePalette** — 拖拽招人源
- **右上铃铛 NotificationBell** — Budget 阈值 / KPI 告警 / Psychologist 升级介入 / Skill 候选

点 Issue 卡进 IssueDetail 看完整对话流（comments + tool_use + run logs）。

---

## 6. Chat Bar

> 与 Coordinator 对话（spec §17.7）。

`/board` 顶部输入框，回车发送。背后做的事：

1. 找到该 company 的 Coordinator agent（`role = "coordinator"`，按创建时间最早的）
2. 用消息内容创建一个新 issue（title 截到 120 字符，description 保留全文）
3. assigneeAgentId = Coordinator
4. 跳转到该 issue 详情页

如果公司没招过 Coordinator，会返回 404 提示先 hire。

---

## 7. Notes 反思笔记

### 是什么

Reflector 在每个 heartbeat 结束时给 agent 写一条 markdown 反思笔记。两种模式：

- **Templated**（无 ANTHROPIC_API_KEY）：固定结构，含 status / duration / issue 引用
- **Haiku-backed**（有 ANTHROPIC_API_KEY）：1-3 句第一人称真反思，输入会含 issue title/description + 最近 5 条 agent output

### 浏览（UI）

`/notes` 页面：

- agent 下拉选员工
- scope 下拉 (all / user / project / local)
- 搜索框留空 = list，输入查询 = 语义搜索（pgvector cosine）

### 浏览（CLI）

```sh
petagent notes list --agent <id>                       # 最近 50 条
petagent notes list --agent <id> --scope project       # 按 scope 过滤
petagent notes search --agent <id> --query "vercel"    # 语义搜索
petagent notes view --note-id <noteId>                 # 单条详情
```

### 写（不直接暴露）

Notes 只由 agent runtime 写，不开 UI 创建路径。Reflector 自动写；agent 自己决定要存的笔记走 `@save-as-skill` 命令 (M2 Group 2 完整版未上线)。

### 启动日志检查

```
[petagent] reflector started (builder=haiku)
[petagent] embedding service mode: openai
```

`builder=templated` + `embedding service mode: stub` 时仍可用，但反思偏简单且语义搜索精度低。

---

## 8. Psychologist 情绪疗愈

### 监听什么

`heartbeat.ended` 和 `agent.output` 事件。每次触发时：

1. **行为初筛**（无 LLM）：检查最近 5 个 heartbeat 的连续失败、output 长度均值-2σ 跌、tool 失败率
2. **Haiku 精筛**（有 ANTHROPIC_API_KEY）：把最近 N 条 output 喂给分类器，返回 `{distress_level, signals, recommended_intervention: none/mild/moderate/severe}`
3. 严重度分级走对应介入

### 介入方式

| 级别 | 行动 | 依赖 |
|---|---|---|
| `mild` | Instructions Bundle 注入抚慰 prompt | adapter 支持 instructions bundle |
| `moderate` | A + Board Comment | 同上 |
| `severe` | 暂停任务 + 开疗愈会话 | adapter 支持 issue pause |
| degraded | 仅 Board Comment | 任意 adapter |

### 透明度（spec γ）

- **对用户**：所有 incident 进 `emotional_incidents` 表，UI `/interventions` 面板按时间轴展示。
- **对被疗愈 agent**：注入 prompt 用"你自己的元认知"口吻写，不显式说"来自 Psychologist"。

### 切换 γ

CompanySettings → Transparency。Opaque（默认）/ Semi / Transparent 三档。Transparent 把全部 incident payload 全展给被监控 agent。

### CLI 审计

```sh
petagent audit emotional-interventions --company-id <id> --since-days 7
```

---

## 多 LLM Provider 配置

> M2 G3 起（v0.5.0+）。Hermes Agent 风格的 provider registry。
> v0.5.1+ 增加 UI 配置面板和首次启动引导，YAML 不再是唯一入口。

PetAgent 把 3 个 LLM-using 子系统（Psychologist 分类器 / Reflector 反思 builder / Embedding 引擎）的 provider 选择**完全配置化**。三种配置方式：

### 方式 1：UI 引导（首次启动最快）

启动后浏览器进 `http://localhost:3100`，Board 顶部会显示蓝色 "Set up an LLM provider" 引导条。

1. 点 **Configure**
2. 选 preset（默认 Kimi）
3. 粘贴 API key
4. 勾选要启用的子系统（Psychologist / Reflector / Embedding）
5. **Save** —— 自动写 `petagent.config.yaml` + `~/.petagent/<instance>/.env`（chmod 600）
6. 重启 server（`pnpm dev:server` watch 模式自动重启；其他模式 Ctrl+C 后再起）

引导条会记住"已 dismiss"状态（localStorage），所以不会一直骚扰你。

### 方式 2：UI 设置页（后续调整、加多个 provider）

侧边栏 **Instance Settings → LLM Providers**（钥匙图标）。

页面分两块：
- **Providers** —— 增删改每个 provider，每条卡片包括：id（slug）、preset 下拉、API key（密码框，已存的会显示绿色 "set" 标签）、可选 model、可选 base_url
- **Routing** —— 三个下拉：Psychologist / Reflector / Embedding 各选一个 declared provider（或 "None — fallback mode"）

Embedding 行只列出支持 `openai_embeddings` 的 provider —— anthropic-only 的 provider 自动过滤。

页面底部 Save 后会显示绿色"Saved"卡片，列出写入的环境变量名 + 重启提示。

### 方式 3：YAML 手写（power user）

何时用：

| 场景 | 用 ENV 还是 YAML/UI |
|---|---|
| 只用 Anthropic + OpenAI | ENV-only 就够 |
| 想用 Kimi / Minimax / DeepSeek / GLM / Gemini | **UI 或 YAML** |
| 想让 Psychologist 用 A、Reflector 用 B 混搭 | **UI 或 YAML** |
| 想覆盖默认 model（比如用 `moonshot-v1-128k` 替换 `moonshot-v1-32k`） | **UI 或 YAML** |
| 想对接自建 OpenAI-兼容网关 | **UI（base_url 字段）或 YAML** |

### 内置 8 个 preset

| Preset | Wire 协议 | Chat 默认 model | Embedding 默认 model | API key env (任一) |
|---|---|---|---|---|
| `anthropic` | anthropic_messages | claude-haiku-4-5-20251001 | — | ANTHROPIC_API_KEY |
| `openai` | openai_chat + openai_embeddings | gpt-4o-mini | text-embedding-3-small | OPENAI_API_KEY |
| `kimi` | openai_chat + openai_embeddings | moonshot-v1-32k | moonshot-v1-embedding | KIMI_API_KEY / MOONSHOT_API_KEY |
| `minimax` | openai_chat + openai_embeddings | abab6.5s-chat | embo-01 | MINIMAX_API_KEY |
| `minimax-cn` | openai_chat + openai_embeddings | abab6.5s-chat | embo-01 | MINIMAX_CN_API_KEY / MINIMAX_API_KEY |
| `deepseek` | openai_chat | deepseek-chat | — | DEEPSEEK_API_KEY |
| `zai` | openai_chat + openai_embeddings | glm-4-flash | embedding-3 | GLM_API_KEY / ZHIPU_API_KEY |
| `gemini` | openai_chat + openai_embeddings | gemini-2.0-flash | text-embedding-004 | GOOGLE_API_KEY / GEMINI_API_KEY |

**Preset 别名**：`claude` → `anthropic`，`moonshot` / `kimi-coding` → `kimi`，`glm` / `zhipu` → `zai`，`google` → `gemini`。

### 配置文件位置

按优先级查找：

1. `$PETAGENT_LLM_CONFIG`（环境变量）
2. `./petagent.config.yaml`（CWD）
3. **不存在** → 退到 ENV-only fallback

只读一次，**修改后必须重启**。

### 最小示例：全 Kimi

```yaml
# petagent.config.yaml
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY

llm_routing:
  psychologist: my-kimi
  reflector: my-kimi
  embedding: my-kimi
```

启动：

```sh
KIMI_API_KEY=sk-moonshot-... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run
```

### 混搭：Kimi 跑 Psychologist，Minimax 跑 Reflector

```yaml
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
  - id: my-minimax
    preset: minimax
    api_key_env: MINIMAX_API_KEY
    model: abab6.5s-chat

llm_routing:
  psychologist: my-kimi      # 情绪分类用 Kimi
  reflector: my-minimax      # 反思 builder 用 Minimax
  embedding: my-kimi         # Notes 检索用 Kimi
```

启动：

```sh
KIMI_API_KEY=sk-moonshot-... \
MINIMAX_API_KEY=eyJh... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run
```

### Provider 字段参考

```yaml
providers:
  - id: <你给这个 provider 起的别名>     # 在 llm_routing 里被引用
    preset: <preset id 或别名>          # MUST 是上表里的 8 个之一
    api_key_env: <环境变量名>            # 推荐：从 env 读 key
    api_key: <字面 key>                 # 可选：写死在 yaml（不推荐，泄漏风险）
    base_url: <自定义 URL>               # 可选：覆盖 preset 默认（自建网关用）
    model: <自定义 model>                # 可选：覆盖 preset 默认 model
```

`api_key_env` 和 `api_key` 至少要有一个。两个都给的话 env 优先。

### Routing 字段

```yaml
llm_routing:
  psychologist: <provider id>   # 可选；省略则 fallback 到 BehavioralPassthrough
  reflector: <provider id>      # 可选；省略则 fallback 到 TemplatedReflectionBuilder
  embedding: <provider id>      # 可选；省略则 fallback 到 SHA-256 stub（关键字检索）
```

**约束（启动时校验，违反则报错退出）**：

1. `embedding` 的 provider preset 必须包含 `openai_embeddings`（anthropic-only 不能 embed）
2. `psychologist` / `reflector` 必须包含某种 chat 协议
3. routing 引用的 provider id 必须在 `providers:` 里声明过
4. provider id 不能重复

### 验证启动

启动日志会逐行报告每个子系统的路由决策：

```
[petagent] llm-router: psychologist → my-kimi (openai_chat, moonshot-v1-32k) [config]
[petagent] llm-router: reflector → my-minimax (openai_chat, abab6.5s-chat) [config]
[petagent] llm-router: embedding → my-kimi (openai_embeddings, moonshot-v1-embedding) [config]
[petagent] psychologist started (classifier=prompted)
[petagent] reflector started (builder=haiku)
[petagent] embedding service mode: kimi
```

`[config]` 表示来自 YAML；`[env-fallback]` 表示退到了 ENV-only。

如果某个子系统没出现在 `llm-router` 行里，说明：
- `llm_routing` 没配它 → 走 fallback
- 或配了但 api_key 没找到 → 看上面有 `[llm-router] xxx: api key not found` 警告

### 完整模板

参考 [`petagent.config.yaml.example`](../petagent.config.yaml.example)（仓库根目录），里面 8 个 preset 各有一段示例。

---

## Skill 自进化（M2 G4 MVP）

> v0.6.0+ 起。从 agent 写的 Notes 里挖掘可复用 patterns，提升为 Skills。

### 流程

```
agent 写 Notes（Reflector，每次 heartbeat）
        ↓
SkillMiner 周批（Mon 02:00）/ 你点 Run-Now
        ↓
LLM 分析 N 条 Notes，找出 ≥3 次重复的 patterns
        ↓
每个 pattern 生成 Skill Candidate（pending 状态）
        ↓
你在 /skills/candidates 看 → Approve 或 Reject
        ↓
Approved 候选自动 promote 为 trial Skill
```

### 启用周批 routine

```sh
PETAGENT_SKILL_MINING_ENABLED=true \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
npx petagentai run
```

启动日志：

```
[petagent] skill-mining routine started (interval=weekly)
```

测试模式（更短间隔，比如 5 分钟）：

```sh
PETAGENT_SKILL_MINING_ENABLED=true \
PETAGENT_SKILL_MINING_INTERVAL_MS=300000 \
npx petagentai run
```

### UI（侧边栏 → Skill Candidates）

页面分两块：

1. **Run mining now 按钮**（顶部）—— 立即对当前 company 跑一次挖掘，无视 cron 间隔。返回 last-run 摘要：扫了多少 notes / 出了多少 candidates / 有没有被跳过。
2. **Candidates 列表** —— 每条 card：标题 + 状态 badge + LLM 写的 rationale + 频次 + agent + 模型 + 时间窗 + 可展开 body。Pending 状态下右上角有 Approve / Reject。

Approve 后：
- 内部调 `SkillManager.save()` → 写 GitStore + DB（`agent_skills` 表）→ skill 状态为 `trial`
- candidate 状态变 `promoted`，`promotedSkillName` 字段填入对应 skill 名

### 不需要任何 key 也能用？

不行 —— SkillMiner 复用 Reflector 的 LLM provider（同一个 chat transport）。Reflector 处于 `templated` fallback 模式时（无 LLM key），Run-Now 会返回：

```json
{ "skippedReason": "no LLM transport configured for skill mining (reflector routing missing)" }
```

UI 会以橙色 alert 显示这条消息。配好 Kimi/Anthropic 任一 provider 即可。

### Notes 多少算够？

至少 3 条命中同一 pattern 才会生成候选（默认 `frequencyThreshold=3`）。低于这个就：
- 不挖
- Run-Now 显示 `notesScanned: X, candidatesCreated: 0`

实际经验：worker 跑 50+ 任务后，挖出 1-3 个高质量 candidate 的概率较高。新公司刚启动头几天 candidates 少甚至为 0 是正常的。

### 不在 MVP 里的（M2 G4 Full 才有）

- Shadow Mode（新 skill 跟旧 skill 并行跑做 A/B）
- KPI 比较器 + Auto-Rollback
- Weekly Digest UI（一周回顾）
- 项目记忆 git sync
- 自动归档（30 天没用的 trial skill 转 retired）

---

## 9. Budget 与告警

### 配置

在 CompanySettings UI 或 CLI 改月度预算。每个 agent 也有独立 budget（不设则跟公司）。

### 阈值

| % | 行动 |
|---|---|
| 70% | Board banner + 通知中心 |
| 90% | 同上 + 邮件给 admin |
| 100% | 同上 + （计划中）暂停该员工的 Issue |

### 启用 budget routine + 邮件

```sh
PETAGENT_BUDGET_CHECK_ENABLED=true \
SMTP_HOST=smtp.example.com SMTP_PORT=587 \
SMTP_USER=alerts SMTP_PASSWORD=... \
SMTP_FROM=alerts@petagent.local \
SMTP_TO_ADMIN=admin@example.com \
npx petagentai run
```

`SMTP_HOST` 缺省时只有 console + 通知中心，没有邮件。

每小时跑一次。`PETAGENT_BUDGET_CHECK_INTERVAL_MS` 可调。

---

## 10. CLI 完整命令

```sh
petagent --help                    # 全部命令一览
petagent run                       # 启动 server
petagent open                      # 在浏览器打开 Board
petagent doctor                    # 健康检查
petagent status                    # 当前公司今日摘要
petagent setup                     # 交互式 setup wizard
petagent onboard                   # 首次 setup（含 docker / db init）
petagent configure                 # 编辑配置文件

# 招人
petagent hire --role <type> --company-id <id> [--name N] [--budget-usd N]

# 反思笔记
petagent notes list --agent <id>
petagent notes search --agent <id> --query "..."
petagent notes view --note-id <id>

# 审计
petagent audit emotional-interventions --company-id <id>

# 公司模板
petagent import @petagent/templates/solo-pack
petagent import @petagent/templates/small-dev-team
petagent import @petagent/templates/hybrid-team
petagent import ./local-template-dir

# Secrets
petagent secrets set anthropic-key --value-stdin
petagent secrets list
petagent secrets get anthropic-key
petagent secrets delete anthropic-key
petagent secrets rotate
```

---

## 11. 环境变量参考

### Server / 平台

| 变量 | 默认 | 说明 |
|---|---|---|
| `PETAGENT_DATA_DIR` | `~/.petagent` | 数据根目录 |
| `PETAGENT_PORT` | 3100 | UI / API 端口 |
| `PETAGENT_DB_URL` | embedded | 显式 Postgres URL（覆盖嵌入式） |
| `PETAGENT_TRANSPARENCY_GAMMA` | `opaque` | `opaque`/`semi`/`transparent` |

### Psychologist

| 变量 | 默认 | 说明 |
|---|---|---|
| `PETAGENT_PSYCHOLOGIST_ENABLED` | `false` | 设 `true` 才启动 |
| `PETAGENT_PSYCHOLOGIST_ACTOR_AGENT_ID` | `null` | 介入 comment 的署名 agent（可选）|

### Reflector

| 变量 | 默认 | 说明 |
|---|---|---|
| `PETAGENT_REFLECTOR_ENABLED` | `false` | 设 `true` 才启动 |
| `PETAGENT_NOTES_GIT_STORE_DIR` | `<dataDir>/notes-store` | Git 存储位置 |

### 真 LLM 后端

| 变量 | 影响 |
|---|---|
| `ANTHROPIC_API_KEY` | Psychologist Haiku 分类器 + Reflector Haiku builder 自动启用 |
| `OPENAI_API_KEY` | EmbeddingService 自动切到 text-embedding-3-small（Notes 真实语义检索）|
| `OPENAI_EMBEDDING_MODEL` | 覆盖 embedding 模型（默认 `text-embedding-3-small`）|

### Budget + 邮件

| 变量 | 默认 | 说明 |
|---|---|---|
| `PETAGENT_BUDGET_CHECK_ENABLED` | `false` | 启用月度 budget 检查 routine |
| `PETAGENT_BUDGET_CHECK_INTERVAL_MS` | 3600000 (1h) | routine 周期 |
| `SMTP_HOST` | — | 必填才发邮件 |
| `SMTP_PORT` | 587 | |
| `SMTP_USER` / `SMTP_PASSWORD` | — | 可选 auth |
| `SMTP_SECURE` | `false` | TLS |
| `SMTP_FROM` | — | 必填才发邮件 |
| `SMTP_TO_ADMIN` | — | 逗号分隔，必填 |

### 验证模式

启动日志会在 createApp 末尾打印实际生效的模式。出现下列三行说明全套配置生效：

```
[petagent] psychologist started (classifier=prompted)
[petagent] reflector started (builder=haiku)
[petagent] embedding service mode: openai
```

---

## 12. 外部 Adapter

PetAgent 完整继承 Paperclip 的 8 种外部 adapter：

| adapter | 命令 | 适用 |
|---|---|---|
| `claude_local` | Claude Code | 本机跑 Claude Code session |
| `codex_local` | Codex CLI | OpenAI Codex |
| `cursor` | Cursor IDE | 通过 Cursor 调度 |
| `openclaw_gateway` | OpenClaw | 内部 gateway |
| `opencode_local` | OpenCode | OSS 编码 agent |
| `pi_local` | Pi (Anthropic) | 内部 |
| `hermes_local` | Hermes Agent | Nous Research |
| `process` | 通用进程 | 自定义 shell-out |
| `http` | 通用 HTTP | 自定义 webhook |

混编：一个 Board 可以同时有 PetAgent native（`adapterType: petagent`）+ Claude Code + Hermes 三种 agent，Coordinator 给所有人都能派活。

---

## 13. 常见问题排查

### `petagent` 命令找不到

`npm install -g petagent` 或 `npx petagentai` 替代。

### Board 上 agent 不动

1. `petagent doctor` 看 server 是否在跑
2. `petagent status` 看 issue 是否真分配给了 agent（assigneeAgentId）
3. UI Activity 页查 agent 最近 heartbeat 状态

### Notes 始终为空

- `PETAGENT_REFLECTOR_ENABLED=true` 是否设了？
- 启动日志有没有 `[petagent] reflector started` 这行？
- agent 是否真跑过 heartbeat（不是空 issue）？

### Psychologist 从不介入

- `PETAGENT_PSYCHOLOGIST_ENABLED=true` 设了吗
- Behavior monitor 需要至少 5 个 heartbeat 样本（连续失败 3 次 / output 长度跌 σ-2 / tool 失败率 > 50%）才会触发；新员工没历史不会立刻被监控
- 启动日志 `classifier=passthrough` 也可以触发，只是不用 Haiku
- `/interventions` 面板看是否真的有 emotional_incident 记录

### 真 embedding 报 401 Unauthorized

`OPENAI_API_KEY` 是否过期。EmbeddingService 在 fail 时不抛错而是 log + 走 stub fallback，所以 Notes 仍能跑只是返回的向量是 SHA-256 的。

### CI / 测试 vector extension 报错

embedded postgres 默认不带 pgvector。`getEmbeddedPostgresTestSupport()` 会探测后 skip 相关测试。生产 Postgres 请装 pgvector：`CREATE EXTENSION vector;`。

### embedded postgres 启动不了 (dyld libicudata.77.dylib)

postinstall 会自动重建丢失的 dylib symlink。如果出问题手动跑：

```sh
node scripts/fix-embedded-postgres-symlinks.mjs
```

---

## 反馈

- Bug / 功能请求：https://github.com/petagentai/petagent/issues
- Spec / 设计文档：[docs/specs/](./specs/)
- 实现计划：[docs/plans/](./plans/)
