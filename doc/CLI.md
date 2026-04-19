# CLI Reference

PetAgent CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm petagentai --help
```

First-time local bootstrap + run:

```sh
pnpm petagentai run
```

Choose local instance:

```sh
pnpm petagentai run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `petagentai onboard` and `petagentai configure --section server` set deployment mode in config
- server onboarding/configure ask for reachability intent and write `server.bind`
- `petagentai run --bind <loopback|lan|tailnet>` passes a quickstart bind preset into first-run onboarding when config is missing
- runtime can override mode with `PETAGENT_DEPLOYMENT_MODE`
- `petagentai run` and `petagentai doctor` still do not expose a direct low-level `--mode` flag

Canonical behavior is documented in `doc/DEPLOYMENT-MODES.md`.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm petagentai allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.petagent`:

```sh
pnpm petagentai run --data-dir ./tmp/petagent-dev
pnpm petagentai issue list --data-dir ./tmp/petagent-dev
```

## Context Profiles

Store local defaults in `~/.petagent/context.json`:

```sh
pnpm petagentai context set --api-base http://localhost:3100 --company-id <company-id>
pnpm petagentai context show
pnpm petagentai context list
pnpm petagentai context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm petagentai context set --api-key-env-var-name PETAGENT_API_KEY
export PETAGENT_API_KEY=...
```

## Company Commands

```sh
pnpm petagentai company list
pnpm petagentai company get <company-id>
pnpm petagentai company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm petagentai company delete PAP --yes --confirm PAP
pnpm petagentai company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `PETAGENT_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `PETAGENT_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm petagentai issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm petagentai issue get <issue-id-or-identifier>
pnpm petagentai issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm petagentai issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm petagentai issue comment <issue-id> --body "..." [--reopen]
pnpm petagentai issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm petagentai issue release <issue-id>
```

## Agent Commands

```sh
pnpm petagentai agent list --company-id <company-id>
pnpm petagentai agent get <agent-id>
pnpm petagentai agent local-cli <agent-id-or-shortname> --company-id <company-id>
```

`agent local-cli` is the quickest way to run local Claude/Codex manually as a PetAgent agent:

- creates a new long-lived agent API key
- installs missing PetAgent skills into `~/.codex/skills` and `~/.claude/skills`
- prints `export ...` lines for `PETAGENT_API_URL`, `PETAGENT_COMPANY_ID`, `PETAGENT_AGENT_ID`, and `PETAGENT_API_KEY`

Example for shortname-based local setup:

```sh
pnpm petagentai agent local-cli codexcoder --company-id <company-id>
pnpm petagentai agent local-cli claudecoder --company-id <company-id>
```

## Approval Commands

```sh
pnpm petagentai approval list --company-id <company-id> [--status pending]
pnpm petagentai approval get <approval-id>
pnpm petagentai approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm petagentai approval approve <approval-id> [--decision-note "..."]
pnpm petagentai approval reject <approval-id> [--decision-note "..."]
pnpm petagentai approval request-revision <approval-id> [--decision-note "..."]
pnpm petagentai approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm petagentai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm petagentai activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm petagentai dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm petagentai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.petagent/instances/default`:

- config: `~/.petagent/instances/default/config.json`
- embedded db: `~/.petagent/instances/default/db`
- logs: `~/.petagent/instances/default/logs`
- storage: `~/.petagent/instances/default/data/storage`
- secrets key: `~/.petagent/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
PETAGENT_HOME=/custom/home PETAGENT_INSTANCE_ID=dev pnpm petagentai run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm petagentai configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
