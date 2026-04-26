---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that PetAgent uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `PETAGENT_BIND` | `loopback` | Reachability preset: `loopback`, `lan`, `tailnet`, or `custom` |
| `PETAGENT_BIND_HOST` | (unset) | Required when `PETAGENT_BIND=custom` |
| `HOST` | `127.0.0.1` | Legacy host override; prefer `PETAGENT_BIND` for new setups |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `PETAGENT_HOME` | `~/.petagent` | Base directory for all PetAgent data |
| `PETAGENT_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `PETAGENT_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |
| `PETAGENT_DEPLOYMENT_EXPOSURE` | `private` | Exposure policy when deployment mode is `authenticated` |
| `PETAGENT_API_URL` | (auto-derived) | PetAgent API base URL. When set externally (e.g., via Kubernetes ConfigMap, load balancer, or reverse proxy), the server preserves the value instead of deriving it from the listen host and port. Useful for deployments where the public-facing URL differs from the local bind address. |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `PETAGENT_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `PETAGENT_SECRETS_MASTER_KEY_FILE` | `~/.petagent/.../secrets/master.key` | Path to key file |
| `PETAGENT_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `PETAGENT_AGENT_ID` | Agent's unique ID |
| `PETAGENT_COMPANY_ID` | Company ID |
| `PETAGENT_API_URL` | PetAgent API base URL (inherits the server-level value; see Server Configuration above) |
| `PETAGENT_API_KEY` | Short-lived JWT for API auth |
| `PETAGENT_RUN_ID` | Current heartbeat run ID |
| `PETAGENT_TASK_ID` | Issue that triggered this wake |
| `PETAGENT_WAKE_REASON` | Wake trigger reason |
| `PETAGENT_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `PETAGENT_APPROVAL_ID` | Resolved approval ID |
| `PETAGENT_APPROVAL_STATUS` | Approval decision |
| `PETAGENT_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

These keys are read by the bundled local adapters (Claude Local, Codex Local, etc.):

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |

## LLM Provider Keys (for PetAgent's own subsystems — Psychologist / Reflector / Embedding)

PetAgent's M2 G3 multi-provider router (see `petagent.config.yaml.example` and
`docs/user-manual.md#多-llm-provider-配置`) reads these per-preset env vars:

| Preset | API Key Env (any of) |
|--------|----------------------|
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `kimi` | `KIMI_API_KEY`, `MOONSHOT_API_KEY` |
| `minimax` | `MINIMAX_API_KEY` |
| `minimax-cn` | `MINIMAX_CN_API_KEY`, `MINIMAX_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `zai` (GLM) | `GLM_API_KEY`, `ZHIPU_API_KEY` |
| `gemini` | `GOOGLE_API_KEY`, `GEMINI_API_KEY` |

Multi-provider router config:

| Variable | Description |
|----------|-------------|
| `PETAGENT_LLM_CONFIG` | Override path for `petagent.config.yaml` (default: `./petagent.config.yaml` in CWD). When the file does not exist, PetAgent falls back to ENV-only mode (synthesises `anthropic` / `openai` presets from the keys above). Distinct from `PETAGENT_CONFIG` (legacy: points at `config.json`). |
| `OPENAI_EMBEDDING_MODEL` | (Legacy / ENV-fallback only) Override embedding model when running in env-only mode. Ignored when `petagent.config.yaml` is present — use `model:` field in the yaml instead. |
