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

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |
