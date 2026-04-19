# PetAgent

> 开源 AI 员工平台 —— 协调并让你的 AI 公司自进化。

**PetAgent** 是一个管理 AI 员工的开源平台。它不只是 agent 编排——它还**内置了一个会自进化、带心理疗愈师的 AI 员工家族**，可以和你的 Claude Code / Codex / OpenClaw / Hermes 等外部 agent 在同一块看板上协作。

## 核心特性

- **PetAgent 员工家族**：Coordinator / Worker（Explorer、Planner、Executor、Reviewer）/ Psychologist，覆盖从分解目标到执行到验收的完整链路
- **心理疗愈子系统**：持续监听 agent 情绪状态、在情绪类卡住时自动介入，避免任务停摆
- **Skill 自进化**：agent 自主积累经验，通过 Shadow Mode 验证后进入共享 skill 库
- **异构编排**：同一个 company 里 PetAgent 员工和外部 agent（Claude Code 等）自然协作
- **可治理**：预算、审批、版本回滚、情感干预审计——每一步都对用户透明

## 快速上手

```bash
brew install petagent-ai/tap/petagent
petagent setup
```

跟随交互式提示选模板（Solo Pack / Small Dev Team / Hybrid Team），连接你的 Anthropic API key，平台就会启动并打开 http://localhost:3000。

## 状态

**v0.1.0-m0**：Fork 阶段完成。平台已可运行（继承 Paperclip 全部能力），PetAgent 员工家族在 M1 里程碑中开发。

## License

基于 [Paperclip](https://github.com/paperclipai/paperclip)（MIT）fork。详见 [LICENSE](./LICENSE) 和 [NOTICES.md](./NOTICES.md)。

## 致谢

- **Paperclip**（MIT, paperclipai）—— 提供底层控制平面
- 未来 M1 将引入 **Hermes Agent**（MIT, Nous Research）的 skill 系统
