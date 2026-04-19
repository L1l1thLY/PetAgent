# Third-Party Notices

PetAgent 的代码来自并整合了以下项目。

## Paperclip (MIT License)

PetAgent 是 [Paperclip](https://github.com/paperclipai/paperclip) 的 fork，遵循 MIT license。完整 MIT 文本见 [LICENSE](./LICENSE)。

Copyright (c) Paperclip contributors.

## 未来的 attribution（M1+ 时加上）

以下将在 M1 整合其组件时加上：

### Hermes Agent (MIT License, Nous Research)

PetAgent 的 Skill 系统（`@petagent/skills`）port 自 [Hermes Agent](https://github.com/NousResearch/hermes-agent)，遵循 MIT license，由 Nous Research 持有。具体被 port 的文件会按 PetAgent spec §13.4 在文件顶部加 attribution 注释。

### Claude Code (仅架构借鉴)

PetAgent 的 Worker 家族和 role template schema 设计在架构上受 Claude Code 多 agent 系统启发。**没有 port 任何代码**。完整法务声明见 PetAgent spec §13.6。
