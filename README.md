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

PetAgent V1 新增（M1 / M2 开发中）：

- **PetAgent 员工家族**：Coordinator / Worker（Explorer、Planner、Executor、Reviewer）/ Psychologist，覆盖从分解目标到执行到验收的完整链路
- **心理疗愈子系统**：持续监听 agent 情绪状态、在情绪类卡住时自动介入，避免任务停摆
- **Skill 自进化**：agent 自主积累经验，通过 Shadow Mode + Validator + Rollback 验证后进入共享 skill 库
- **全套招人心智 UI**：Board 员工头像栏、Issue 对话流 emoji 可视化、拖拽招人、角色面板、情绪介入透明面板、通知中心、Weekly Digest

## 快速上手

```bash
brew install petagent-ai/tap/petagent    # 或用 PowerShell / 源码安装
petagent run
```

跟随交互式提示选模板（Solo Pack / Small Dev Team / Hybrid Team），连接你的 Anthropic API key，平台就会启动并在 http://localhost:3000 打开 Board。

```bash
petagent open     # 在浏览器打开 Board（支持 PETAGENT_UI_URL 覆盖）
petagent doctor   # 运行诊断
petagent --help   # 查看所有命令
```

## 状态

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| **M0** | Fork Paperclip + 全套 rebrand | ✅ 2026-04-19（v0.1.0-m0） |
| **M1** | PetAgent 员工家族 + Psychologist + Plugin 架构 | 🚧 开发中 |
| **M2** | Skill 自进化（Shadow Mode + Validator + Rollback） | ⏸ 计划中 |
| **M3** | 代码架构自升级 | ⏸ 架构就绪后启动 |

M0 阶段平台已可运行，完整继承 Paperclip 的能力。PetAgent 的差异化功能（员工家族 / Psychologist / 自进化）在 M1 中开发。

## License

基于 [Paperclip](https://github.com/paperclipai/paperclip)（MIT）fork，PetAgent 自身也采用 **MIT License**。

- 完整 MIT 文本见 [LICENSE](./LICENSE)
- 第三方项目 attribution 见 [NOTICES.md](./NOTICES.md)
- 原 Paperclip README 归档在 [README.paperclip-origin.md](./README.paperclip-origin.md)

## 致谢

- **[Paperclip](https://github.com/paperclipai/paperclip)**（MIT, paperclipai） —— 提供底层控制平面，PetAgent 的直接 fork 基底
- **[Hermes Agent](https://github.com/NousResearch/hermes-agent)**（MIT, Nous Research） —— M1 将 port 其 skill 系统
- **[Claude Code](https://claude.com/claude-code)**（Anthropic） —— 多 agent 架构灵感来源（仅架构借鉴，未 port 代码）

特别鸣谢所有 Paperclip contributors —— 你们的工作让 PetAgent 成为可能。
