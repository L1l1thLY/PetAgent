---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `petagentai run`

One-command bootstrap and start:

```sh
pnpm petagentai run
```

Does:

1. Auto-onboards if config is missing
2. Runs `petagentai doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm petagentai run --instance dev
```

## `petagentai onboard`

Interactive first-time setup:

```sh
pnpm petagentai onboard
```

If PetAgent is already configured, rerunning `onboard` keeps the existing config in place. Use `petagentai configure` to change settings on an existing install.

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm petagentai onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm petagentai onboard --yes
```

On an existing install, `--yes` now preserves the current config and just starts PetAgent with that setup.

## `petagentai doctor`

Health checks with optional auto-repair:

```sh
pnpm petagentai doctor
pnpm petagentai doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `petagentai configure`

Update configuration sections:

```sh
pnpm petagentai configure --section server
pnpm petagentai configure --section secrets
pnpm petagentai configure --section storage
```

## `petagentai env`

Show resolved environment configuration:

```sh
pnpm petagentai env
```

This now includes bind-oriented deployment settings such as `PAPERCLIP_BIND` and `PAPERCLIP_BIND_HOST` when configured.

## `petagentai allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm petagentai allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.petagent/instances/default/config.json` |
| Database | `~/.petagent/instances/default/db` |
| Logs | `~/.petagent/instances/default/logs` |
| Storage | `~/.petagent/instances/default/data/storage` |
| Secrets key | `~/.petagent/instances/default/secrets/master.key` |

Override with:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm petagentai run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm petagentai run --data-dir ./tmp/petagent-dev
pnpm petagentai doctor --data-dir ./tmp/petagent-dev
```
