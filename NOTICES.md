# Third-Party Notices

PetAgent 的代码来自并整合了以下项目。

## Paperclip (MIT License)

PetAgent 是 [Paperclip](https://github.com/paperclipai/paperclip) 的 fork，遵循 MIT license。完整 MIT 文本见 [LICENSE](./LICENSE)。

Copyright (c) Paperclip contributors.

## Hermes Agent (MIT License, Nous Research)

PetAgent 的 Skill 系统（`@petagent/skills`）和 Safety Net（`@petagent/safety-net`）的部分文件 port 自 [Hermes Agent](https://github.com/NousResearch/hermes-agent)，遵循 MIT license，由 Nous Research 持有。完整 LICENSE 文本见本文件末尾。

### 已 port 的文件清单（M1 实际完成范围）

| PetAgent 文件 | Hermes 源文件 | 状态 |
| --- | --- | --- |
| `packages/skills/src/skill_utils.ts` | `agent/skill_utils.py` | TypeScript port — `parseFrontmatter`、`isSkillActivated`（platforms / requires / fallback 三层匹配） |
| `packages/skills/src/skill_manager.ts` | `tools/skill_manager_tool.py` | TypeScript port — `SkillManager` + `SkillRepository` 接口（CRUD 子集） |
| `packages/skills/src/indexer.ts` | `agent/prompt_builder.py` L.419-800 | TypeScript port — `LruCache`（L1 tier；L2/L3 延后到 M2） |
| `packages/skills/src/commands.ts` | `agent/skill_commands.py` | TypeScript port — `parseSaveAsSkill` 指令解析 |
| `packages/safety-net/src/fuzzy_match.ts` | `tools/fuzzy_match.py` | TypeScript port — 9 策略中的 6 条已实现（trimmed_boundary / block_anchor / context_aware 待 follow-up） |
| `packages/safety-net/src/validator/threat_patterns.ts` | `tools/skills_guard.py` (`THREAT_PATTERNS`) | TypeScript port — 121 条威胁模式中的 15 条 + 全部 17 个不可见 / 控制字符（`INVISIBLE_CHARS` 内联在同文件） |
| `packages/safety-net/src/validator/index.ts` | `tools/skills_guard.py` (validator orchestration) | TypeScript port — `validateWithRegexOnly` + `validateWithLLM` 两层编排 |

### 灵感来源（未 port 代码）

下列 PetAgent 文件在精神 / 模式上参考了 Hermes 的对应位置，但未直接 port 代码（重写、本地化、或以英文重新表达）：

| PetAgent 文件 | Hermes 源 | 说明 |
| --- | --- | --- |
| `packages/psychologist/src/preventive.ts` | `agent/prompt_builder.py` L.790-792 | "scan available skills before working" 段的 metacognitive 改写为预防性失败模式注入 |
| `packages/my-agent-adapter/built-in-roles/*.md` (6 个 role 模板的 `## Self-evolution` 段) | `agent/prompt_builder.py` L.790-792 | "load partially-relevant skills"、"patch on issue"、"`@save-as-skill`" 三段 prompt 的英文重述 |

### 文件级 attribution 注释

Per spec §13.4，被 port 的文件顶部应保留 attribution 注释。M0/M1 阶段未在每个文件顶部添加注释；本表是当前阶段的事实来源。后续若 port 范围扩大或文件名调整，此表与文件顶部注释会一并更新。

### Hermes LICENSE 全文

```
MIT License

Copyright (c) 2025 Nous Research

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Claude Code (仅架构借鉴)

PetAgent 的 Worker 家族（Coordinator + 4 Worker 变体 + Psychologist）和 role template schema 设计在架构上受 Claude Code 多 agent 系统启发。**没有 port 任何代码** — 所有 prompt、命名、字段定义均为本仓库独立编写。完整法务声明见 PetAgent spec §13.6。
