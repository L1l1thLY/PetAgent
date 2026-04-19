# Changelog

PetAgent 的所有重要变更都记录在这里。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。

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
