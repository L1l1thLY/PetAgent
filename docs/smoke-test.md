# PetAgent Smoke Test Walkthrough

> **目的**：把 v0.4.0-pre-m2 全部已发布功能跑一遍，确认没有 release-blocker。
> **预计耗时**：30–45 分钟（不含 API key 申请 / 邮箱配置）。
> **前提**：Node.js ≥ 20，pnpm ≥ 9，能访问 https://api.anthropic.com 和 https://api.openai.com（可选）。

每个 step 写了 **做什么** + **应该看到什么** + **如果对不上**。

---

## 0. 准备

### 0.1 装依赖 + 跑测试基线

```bash
cd /Volumes/t7/OpenSourceProject/PetAgent
pnpm install
```

**应看到**：postinstall 自动跑 `scripts/fix-embedded-postgres-symlinks.mjs`，输出 `inspected 1 embedded-postgres lib dir(s); created N symlink(s).`（N 可能是 0 或更多，0 = 已经修过）。

```bash
pnpm exec vitest run 2>&1 | tail -3
```

**应看到**：`Test Files  345 passed | 19 skipped (364) / Tests  2084 passed | 119 skipped (2203)`，`0 failed`。

**对不上**：
- 如果 `Test Files X failed` 非 0 → 抓那几个文件名，看错误。**不是 pgvector / embedded postgres 启动问题**才是真 regression。
- pgvector / postgres init 报错 → 多半是 dylib 没修。手动跑 `node scripts/fix-embedded-postgres-symlinks.mjs` 再试。

### 0.2 准备 keys（可选但强推）

最小可跑：什么 key 都不设也能进 UI 看 Board。但要试 LLM 路径必须有：

- **`ANTHROPIC_API_KEY`** — Psychologist 升级到 Haiku 分类器；Reflector 升级到 Haiku 反思 builder
- **`OPENAI_API_KEY`** — EmbeddingService 升级到真 text-embedding-3-small（Notes 语义检索从 SHA-256 stub 升级）

不设 key 也能"装作有"测试模板路径——把 `classifier=passthrough` / `builder=templated` / `embedding=stub` 当成 N/A pass。

### 0.3 build 一把（让 dev runner 找得到 dist）

```bash
pnpm build
```

**应看到**：所有包陆续 `Done`，最后 `Tasks: <N> successful`。

**对不上**：build 失败 → 看哪个包，多半是 typecheck 报错。`pnpm typecheck` 单独跑能定位文件。

---

## 1. 启动平台

### 1.1 不带任何 LLM key（baseline 路径）

```bash
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
pnpm dev:server
```

**应看到日志**：

```
[petagent] psychologist started (classifier=passthrough)
[petagent] reflector started (builder=templated)
[petagent] embedding service mode: stub
```

服务器在 **http://localhost:3100** 起来。

**对不上**：
- 没有这三行 `[petagent] ... started` → 检查 `PETAGENT_*` env 是不是 `true`（小写不行，大写不行，要严格 `true`）
- 启动报错 `vector extension not available` 或 `Postgres init script` → 走 0.1 修 dylib。

### 1.2 浏览器打开

```bash
open http://localhost:3100
```

**应看到**：登录页或公司选择页（看 Paperclip baseline 配置）。

---

## 2. 创建公司 + 招第一批员工

### 2.1 通过 onboard 走完整流程（推荐第一次跑）

`Ctrl-C` 停 dev:server，换：

```bash
npx petagentai onboard --yes
```

**应看到**：交互式 wizard 提示创建 company → 选模板（Solo Pack 最简单）→ 安装 secrets → 启动平台。最后给一个 http://localhost:3100 链接。

**对不上**：onboard 找不到 → 用本地 `pnpm petagent onboard --yes` 替代。

### 2.2 或者直接 CLI 招（如果已经有公司）

```bash
# 先列公司
npx petagentai company list

# 招一个 Coordinator + 一个 Executor
npx petagentai hire --role coordinator --company-id <COMPANY_ID> --name "Atlas"
npx petagentai hire --role worker/executor --company-id <COMPANY_ID> --name "Bob" --budget-usd 30
```

**应看到**：
- 服务端日志：`[petagent] hire latency: <N>ms (companyId=... role=coordinator)` —— **N 应 < 3000**（spec §21.2 SLA）。
- CLI 返回 JSON 含 `id` / `name` / `roleType` / `adapterType: petagent`。

**对不上**：
- hire latency > 3s → 多半是 embedded postgres 第一次连接。第二次 hire 应该 < 500ms。
- `roleType not found` → 检查 role 名字（`coordinator` / `worker/executor` / `worker/explorer` / `worker/planner` / `worker/reviewer` / `psychologist` 这 6 种）。

### 2.3 在 UI 验证

刷新 `/board`：

**应看到**：
- 顶部出现 EmployeeBar，含刚招的 agent 头像
- 三栏 Kanban（Todo / In Progress / Done）都为空
- 顶部 ChatBar 输入框 + Send 按钮（**spec §17.7 关键验证点**）

---

## 3. 派活：通过 Chat Bar 给 Coordinator 任务

### 3.1 在 Board 顶部输入

```
帮我把项目 README 加一个英文版
```

回车或点 Send。

**应看到**：
- 跳到新创建的 issue 详情页
- issue title 是上面的消息（截 120 字符）
- description 是完整消息
- assignee 是刚招的 Coordinator

**对不上**：
- 404 `No Coordinator agent in this company` → 公司没招 Coordinator。回 §2.2 招一个。
- Network error → 查浏览器 Console 看具体 URL。`/api/companies/:id/chat` 应在 server 路由列表里。

### 3.2 验证 latency log

服务端日志应有：

```
[petagent] hire latency: <N>ms ...   # 之前 hire 的
POST /api/companies/.../chat 201 <M>ms   # 这次 chat 创建 issue
```

`M` 通常 < 200ms。

---

## 4. 触发 Psychologist 介入

Psychologist 需要 5+ heartbeat 样本才会 fire（spec §7.2 行为初筛）。本机 smoke test 不容易自然触发，用 SQL 注入伪装数据：

### 4.1 直接写假的 heartbeat_runs（让 BehaviorMonitor 看到 3 次连续失败）

打开数据库（embedded postgres 路径在 `~/.petagent/db/` 或 `data/db/`，连接信息在 `~/.petagent/config.json` 的 `database.embeddedPostgresPort`）：

```bash
# 找 port
cat ~/.petagent/config.json | grep embeddedPostgresPort
# 假设 port = 54321

psql postgres://petagent:petagent@127.0.0.1:54321/petagent
```

```sql
-- 找 agent id
SELECT id, name FROM agents WHERE name = 'Bob';
-- 假设 'a1b2c3...'

-- 注入 5 条 heartbeat_runs：3 失败 + 2 成功，最近的 3 个失败连一起
INSERT INTO heartbeat_runs (id, agent_id, status, started_at, finished_at)
VALUES
  (gen_random_uuid(), 'a1b2c3...', 'failed', now() - interval '5 minutes', now() - interval '5 minutes'),
  (gen_random_uuid(), 'a1b2c3...', 'failed', now() - interval '4 minutes', now() - interval '4 minutes'),
  (gen_random_uuid(), 'a1b2c3...', 'failed', now() - interval '3 minutes', now() - interval '3 minutes'),
  (gen_random_uuid(), 'a1b2c3...', 'succeeded', now() - interval '2 minutes', now() - interval '2 minutes'),
  (gen_random_uuid(), 'a1b2c3...', 'succeeded', now() - interval '1 minute', now() - interval '1 minute');
```

### 4.2 触发一个 heartbeat.ended 事件

在另一个 shell：

```bash
# 用 server 内置 publishLiveEvent 不直接暴露给 user，最简单办法：
# 让某个 agent 的 issue 跑一次心跳。如果 agent 是 PetAgent native 不会跑（runtime 没接），
# 那么用 SQL 直接 update issue 状态触发 publishLiveEvent

psql postgres://... -c "UPDATE issues SET status = 'in_progress' WHERE id = '<ISSUE_ID>';"
psql postgres://... -c "UPDATE issues SET status = 'done' WHERE id = '<ISSUE_ID>';"
```

> **说明**：本机 smoke 路径下 PetAgent native runtime 还没接 heartbeat 循环（M3）。Psychologist 实际触发依赖 `agent.output` / `heartbeat.ended` 事件。简化方案：用现有 Paperclip Claude Code adapter agent 跑（4.1 替换 agent_id 为某个 claude_local agent，行为信号会真发）。

### 4.3 在 UI 验证

打开 `/interventions`：

**应看到**：
- 一条新 incident 记录
- classification = `mild` / `moderate` / `severe`
- 如果 ANTHROPIC_API_KEY 未设：classifier 会返回 mild + signals=`["behavioral_passthrough"]`
- 如果 ANTHROPIC_API_KEY 设了：classifier 返回更细的 signals
- intervention_kind 显示 `instructions_inject` / `instructions_inject_with_comment` / `pause_therapy` 之一

**对不上**：
- `/interventions` 全空 → BehaviorMonitor 阈值没触发。检查注入的 heartbeat_runs 是不是真的连续 3 个 failed
- 看不到 inject 文件 → agent 的 instructionsBundle 模式可能没启用。`adapterType: petagent` 默认支持，外部 adapter（claude_local 等）需在 capability 表里有

### 4.4 验证 inject 文件落盘

```bash
find ~/.petagent -name "psychologist-injection.md" 2>/dev/null
```

**应看到**：一个或多个 `psychologist-injection.md`，内容是元认知 prompt（"你已经尝试了 X 次相似方案..."）。

---

## 5. Reflector 写 Notes

### 5.1 触发一个 heartbeat.ended

同 4.2。每次 heartbeat 结束 Reflector 应写一条 note。

### 5.2 验证 Notes 在 DB

```sql
SELECT id, agent_id, scope, note_type, LEFT(body, 120) AS body_preview
FROM agent_notes
ORDER BY created_at DESC
LIMIT 10;
```

**应看到**：
- 至少一条 `note_type = 'heartbeat_reflection'`
- `scope = 'project'`
- body 内容：
  - **builder=templated 时**：`## Heartbeat reflection\n\n- status: succeeded\n- ...\n\nAuto-templated reflection. M2 Group 2 will replace this with a Haiku-built note.`
  - **builder=haiku 时**：1-3 句第一人称真反思，无固定结构

### 5.3 在 UI 浏览

打开 `/notes`：

**应看到**：
- agent 下拉，选 Bob
- 列表显示最近的反思
- 顶部 scope 下拉（all / user / project / local）
- 搜索框输入 `succeeded` 回车 → 调 `/notes/search`，应仍能命中

**对不上**：
- 列表全空但 DB 有数据 → company id 不匹配，确认 `useCompany` 的 selectedCompanyId 跟 DB 的 agent_notes.company_id 一致
- 搜索无结果 → embedding service mode 是 stub 时语义匹配差，搜 exact 字符串才稳

### 5.4 通过 CLI 浏览

```bash
npx petagentai notes list --agent <bob_id> --company-id <company_id> --limit 5
npx petagentai notes search --agent <bob_id> --company-id <company_id> --query "deploy"
```

**应看到**：JSON 输出（默认）或 markdown 列表（`--no-json`），匹配 DB 内容。

---

## 6. Budget alerts

### 6.1 设极小预算让自己马上 exceeded

```sql
-- 把 Bob 的月预算设成 1 cent，spent 设成 100 cents（确保超 100%）
UPDATE agents SET budget_monthly_cents = 1, spent_monthly_cents = 100
WHERE name = 'Bob';
```

### 6.2 启 budget routine（一次性）

最简单：重启 server 加 `PETAGENT_BUDGET_CHECK_ENABLED=true`：

```bash
PETAGENT_BUDGET_CHECK_ENABLED=true \
PETAGENT_BUDGET_CHECK_INTERVAL_MS=60000 \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
pnpm dev:server
```

**应看到日志**：

```
[petagent] budget-check routine started (email=off)
```

等 1 分钟后 routine 第一次跑。

### 6.3 验证通知

打开 UI 顶栏 NotificationBell（铃铛图标）：

**应看到**：
- 一条 budget alert 类型的通知，level=`exceeded`，scope=Bob 的名字

也可看 server 控制台日志：

```
[budget-check] alert fired: scope=agent label=Bob level=exceeded utilization=1.00
```

**对不上**：
- 铃铛没数字 → 等更久（routine 至少 1 分钟跑一次）
- DB 里 spent_monthly_cents 没对上 → 看 `costEvents` 表是否当月之和也算

### 6.4 试 SMTP 邮件（可选）

```bash
PETAGENT_BUDGET_CHECK_ENABLED=true \
PETAGENT_BUDGET_CHECK_INTERVAL_MS=60000 \
SMTP_HOST=smtp.your-mailgun.com SMTP_PORT=587 \
SMTP_USER=... SMTP_PASSWORD=... \
SMTP_FROM=alerts@example.com SMTP_TO_ADMIN=you@example.com \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
pnpm dev:server
```

**应看到日志**：

```
[petagent] budget-check routine started (email=smtp)
```

routine 触发后看收件箱：

**应看到邮件**：
- 主题：`[PetAgent] EXCEEDED budget alert — Bob (100%)`
- 正文：scope / level / spent / budget / autoPause / 签名

**对不上**：
- `budget-check routine started (email=off)` 即使设了 SMTP_* → SMTP_HOST、SMTP_FROM、SMTP_TO_ADMIN 三个必须**都**设
- 邮件没收到，但日志显示 `smtp-alert-notifier.send failed` → 看 server 日志的 err 字段。常见：SMTP 凭据错、防火墙 blocking 587

---

## 7. 升级到全 LLM 后端

### 7.1 加 keys 重启

```bash
ANTHROPIC_API_KEY=sk-ant-... \
OPENAI_API_KEY=sk-... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
pnpm dev:server
```

**应看到**：

```
[petagent] psychologist started (classifier=prompted)
[petagent] reflector started (builder=haiku)
[petagent] embedding service mode: openai
```

### 7.2 触发新 heartbeat 看真反思

回 §4.2 步骤再触发一次。

```sql
SELECT body FROM agent_notes WHERE agent_id = '<bob>' ORDER BY created_at DESC LIMIT 1;
```

**应看到**：1-3 句第一人称的真自然语言反思（不是模板）。

**对不上**：
- 仍是模板格式 → ANTHROPIC_API_KEY 未生效。检查 `process.env.ANTHROPIC_API_KEY` 是不是空字符串
- LLM 返回 401 → key 错。日志会 swallow + warn

### 7.3 试语义搜索精度

塞两条人造 note：

```sql
INSERT INTO agent_notes (id, company_id, agent_id, scope, note_type, body, embedding)
SELECT gen_random_uuid(), '<co>', '<bob>', 'project', 'lesson',
       'Vercel CLI auth via --token, not VERCEL_TOKEN env',
       NULL;
INSERT INTO agent_notes (id, company_id, agent_id, scope, note_type, body, embedding)
SELECT gen_random_uuid(), '<co>', '<bob>', 'project', 'lesson',
       'Postgres requires SSL in production',
       NULL;
```

> 注意：embedding 留 NULL 时不会被 search 命中。要让它被命中：删掉这两条手插的，改用 Reflector 写的真 note；或 SQL 触发 `EmbeddingService.embed` 不直接暴露——更靠谱是让 agent 自然累积。

通过 `/notes` UI 搜 "vercel"：

**应看到**：
- embedding=openai 时：能召回包含 "vercel" 语义相关的 note，**即使** body 不字面包含 vercel
- embedding=stub 时：基本只命中字面包含 vercel 的（hash 派生向量没语义）

---

## 7.5. 多 LLM Provider 路由（v0.5.0+ / UI v0.5.1+）

> 验证 Hermes-style provider registry —— 用 Kimi / Minimax / 任何内置 preset 替代 Anthropic + OpenAI。
> v0.5.1 起新增 UI 流程：首页 banner + 设置页。下面两套路径都跑一遍。

### 7.5.0 UI 路径（最简，v0.5.1+）

1. **干净启动**：清掉旧 `petagent.config.yaml`、`~/.petagent/<instance>/.env` 里的 KIMI_*/MINIMAX_* 环境变量
   ```sh
   rm -f petagent.config.yaml
   ```
2. `pnpm dev:server` → 浏览器进 `http://localhost:3100`
3. **应看到**：Board 顶部蓝色 banner "Set up an LLM provider to unlock..."
4. 点 **Configure** → 弹窗
5. 选 preset = Kimi（默认就是）→ 粘贴 KIMI key → 三个 checkbox 默认全选 → **Save**
6. **应看到**：绿色 "Saved" 卡片，提示 `Wrote env vars: KIMI_API_KEY` + restart 指引
7. server 应该自动重启（tsx watch 检测到 petagent.config.yaml 写入）
8. 重启日志检查（同 7.5.3）：`[petagent] llm-router: psychologist → my-kimi (openai_chat, ...) [config]`
9. 刷新页面，banner 消失（hasAnyResolvedKey=true 后不再显示）
10. 进 **Instance Settings → LLM Providers**（侧边栏钥匙图标）→ 应看到 my-kimi 一条，API key 字段显示 "set" 绿标

**对不上**：
- banner 不出现 → 检查浏览器 DevTools `/api/instance/settings/llm-providers` 响应；如果 `hasAnyResolvedKey=true` 说明已有 key 在跑，banner 会自动隐藏
- Save 失败 → 看 Network 面板的 400 响应 body
- server 没重启 → 不是 watch 模式，需手动 Ctrl+C 重起

### 7.5.1 准备 keys

至少需要两个之一才能验证（Anthropic 一直都有，所以 BC 路径默认就在跑）：

- `KIMI_API_KEY` —— Moonshot 控制台 (kimi.cn) 申请
- `MINIMAX_API_KEY` —— Minimax 控制台 (minimaxi.com) 申请

### 7.5.2 写最小 YAML 配置

在 PetAgent 仓库根目录（或者 CWD）：

```sh
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
```

### 7.5.3 重启验证

杀掉旧 server，重启：

```sh
KIMI_API_KEY=sk-moonshot-... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
pnpm dev:server
```

**应看到**（关键确认 3 行）：

```
[petagent] llm-router: psychologist → my-kimi (openai_chat, moonshot-v1-32k) [config]
[petagent] llm-router: reflector → my-kimi (openai_chat, moonshot-v1-32k) [config]
[petagent] llm-router: embedding → my-kimi (openai_embeddings, moonshot-v1-embedding) [config]
[petagent] psychologist started (classifier=prompted)
[petagent] reflector started (builder=haiku)
[petagent] embedding service mode: kimi
```

**关键点**：
- 行尾必须是 `[config]` 不是 `[env-fallback]` —— 说明 YAML 被读到了
- `embedding service mode: kimi` —— **不是 `openai`**，说明 router 把 embedding 也指给了 Kimi

**如果看到 `[env-fallback]`**：说明 YAML 没被读到。检查：
- `petagent.config.yaml` 是不是在你运行 `pnpm dev:server` 的同一个 CWD
- 或者用 `PETAGENT_LLM_CONFIG=/abs/path/petagent.config.yaml` 强制路径

### 7.5.4 触发一次真 LLM 调用

通过 Chat Bar 派活给 Coordinator（参考 §3 步骤），等 Reflector 写出第一条 Note。

打开 `/notes` 页面，新 Note 的 body：
- ❌ 不应该是 templated 模式那种 `Auto-templated reflection.`
- ✅ 应该是 Kimi 实际生成的中文/英文反思（一段自然语言文字）

如果 body 长得像模板：
- 看 server 日志找 `[llm-router] reflector: api key not found` —— key 没传进去
- 或者找 `OpenAIChatCompletionsTransport: HTTP 401` —— key 错了

### 7.5.5 混搭场景：Psychologist 用 Kimi、Reflector 用 Minimax

```sh
cat > petagent.config.yaml <<'EOF'
providers:
  - id: my-kimi
    preset: kimi
    api_key_env: KIMI_API_KEY
  - id: my-minimax
    preset: minimax
    api_key_env: MINIMAX_API_KEY

llm_routing:
  psychologist: my-kimi
  reflector: my-minimax
  embedding: my-kimi
EOF

KIMI_API_KEY=sk-moonshot-... \
MINIMAX_API_KEY=eyJh... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
pnpm dev:server
```

启动日志：

```
[petagent] llm-router: psychologist → my-kimi (openai_chat, moonshot-v1-32k) [config]
[petagent] llm-router: reflector → my-minimax (openai_chat, abab6.5s-chat) [config]
[petagent] llm-router: embedding → my-kimi (openai_embeddings, moonshot-v1-embedding) [config]
```

混搭跑通后再触发一次 Reflector 写 Note —— 这次的 Note 是 Minimax 生成的，能跟之前 Kimi 生成的对比下风格差异（Minimax 中文略学究、Kimi 偏简洁）。

### 7.5.6 BC 验证：删 yaml 后回到 ENV-only 模式

```sh
mv petagent.config.yaml petagent.config.yaml.bak
ANTHROPIC_API_KEY=sk-ant-... \
OPENAI_API_KEY=sk-openai-... \
PETAGENT_PSYCHOLOGIST_ENABLED=true \
PETAGENT_REFLECTOR_ENABLED=true \
pnpm dev:server
```

应看到日志变回老样子：

```
[petagent] llm-router: psychologist → _bc_anthropic (anthropic_messages, claude-haiku-4-5-20251001) [env-fallback]
[petagent] llm-router: reflector → _bc_anthropic (anthropic_messages, claude-haiku-4-5-20251001) [env-fallback]
[petagent] llm-router: embedding → _bc_openai (openai_embeddings, text-embedding-3-small) [env-fallback]
```

`[env-fallback]` + `_bc_*` 前缀 —— 说明 YAML 不存在时退回 ENV-only。

恢复 yaml：

```sh
mv petagent.config.yaml.bak petagent.config.yaml
```

---

## 8. workspace-runtime 真跑

> 这块不是核心 V1 路径，spec §3.7 isolation。可选烟测。

如果你想看 git_worktree 模式：

```bash
# 招一个 worktree-isolation 的 worker
npx petagentai hire --role worker/executor --company-id <co> \
  --name Sarah --adapter-type claude_local
```

然后给 Sarah 派 issue 并配 `workspaceStrategy: { type: "git_worktree" }`，runtime 会创建 git worktree 跑。

烟测的简化版：

```bash
# 跑 workspace-runtime 测试套
pnpm exec vitest run server/src/__tests__/workspace-runtime.test.ts
```

**应看到**：51 passed / 3 skipped / 0 failed。

---

## 9. 前端 UI 烟测

打开 http://localhost:3100，挨个验证：

| 页面 | 验证点 |
|---|---|
| `/board` | 顶部 ChatBar / 中部 EmployeeBar / Kanban / 拖拽 RolePalette |
| `/agents` | agent 列表，点进详情看 capabilities / runtime state / instructions |
| `/issues` | issue 列表，过滤、搜索 |
| `/projects` | project 列表 + 详情 |
| `/goals` | goal 列表 |
| `/notes` | agent 选择 / scope 过滤 / 搜索 |
| `/interventions` | 时间轴 / agent 过滤 / severity 过滤 / CSV 导出 |
| `/roles` | source 分组 / prompt 预览 / tools/disallowed/skills 显示 |
| `/dashboard` | 当日统计卡片 |
| `/costs` | 月度成本明细 |
| `/inbox` | 收件箱（mentions / approvals） |
| `/notifications`（铃铛） | budget / KPI / Psychologist 三类通知 |

**通用对不上**：
- 页面 404 → 检查 `App.tsx` 的 Route 注册
- API 401/403 → 没登录或 actor middleware 拒绝。`/api/auth` 走一下登录
- 数据全空但应该有 → company id 不匹配，看 CompanyContext

---

## 10. 收尾

### 10.1 终端清理

`Ctrl-C` 停 dev:server。

### 10.2 验证 git 状态干净

```bash
cd /Volumes/t7/OpenSourceProject/PetAgent
git status
```

**应看到**：`nothing to commit, working tree clean`。所有 release 工作都已 commit + tag。

### 10.3 看 tag 历程

```bash
git tag --list | grep -E "^v0\." | sort -V
```

**应看到**：
```
v0.1.0-m0
v0.2.0-m1
v0.3.0-m2-preview
v0.3.1-m2-alive
v0.4.0-pre-m2
```

### 10.4 push tag（让远端也有）

```bash
git push origin v0.4.0-pre-m2
# 或一次推全部
git push --tags
```

---

## 烟测结果记录

测完一遍，把发现的问题归三类：

- **Release blocker**：startup 失败 / 数据写丢 / UI 白屏 / 测试套全红 → 立刻修
- **Bug**：某条路径有偏差但能 work-around → 先记录，下个迭代修
- **Wishlist**：想要但 spec 没保证的 → 列入 M2 完整版的 wishlist

把这三类写到一个 `smoke-test-report-YYYY-MM-DD.md`，提交时 attach 给后续开发用。

---

## 已知限制（不算 bug）

| 现象 | 原因 |
|---|---|
| PetAgent native agent 不真跑 heartbeat | M3 territory；当前 `adapterType: petagent` 的 agent 只能存元数据，要跑真 heartbeat 用 claude_local / codex_local 等外部 adapter |
| Notes 语义检索精度低 | OPENAI_API_KEY 未设时用 SHA-256 stub，没语义；设了之后立刻好转 |
| pgvector 测试本地全 skip | embedded postgres 不带 pgvector；CI 装 pgvector 后能跑 |
| SkillMiner / Shadow Mode / Auto-Rollback / Weekly Digest 缺 | M2 完整版（v0.5.0+）才上 |
| 项目 scope 记忆没远端 git sync | M2 Task 30b 缺；本机 GitStore 是有的 |
| Skill 90 天自动归档 | M2 Group 7 缺 |
| KPI 7-day-rolling 告警 banner | M2 Group 5/30d 缺 |

这些不是 v0.4.0-pre-m2 的 release blocker，是下个 milestone 的 feature scope。
