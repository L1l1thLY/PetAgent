---
title: Quickstart
summary: Get PetAgent running in minutes
---

Get PetAgent running locally in under 5 minutes.

## Quick Start (Recommended)

```sh
npx petagentai onboard --yes
```

This walks you through setup, configures your environment, and gets PetAgent running.

If you already have a PetAgent install, rerunning `onboard` keeps your current config and data paths intact. Use `petagentai configure` if you want to edit settings.

To start PetAgent again later:

```sh
npx petagentai run
```

> **Note:** If you used `npx` for setup, always use `npx petagentai` to run commands. The `pnpm petagentai` form only works inside a cloned copy of the PetAgent repository (see Local Development below).

## Local Development

For contributors working on PetAgent itself.

**Prerequisites:**
- Node.js 20+ and pnpm 9+
- **PostgreSQL + pgvector**. The bundled `embedded-postgres` binary does NOT include pgvector, and migration `0058` requires it. You must install Postgres + pgvector and point PetAgent at it via `DATABASE_URL`:

  ```sh
  # macOS
  brew install postgresql@17 pgvector
  brew services start postgresql@17
  createdb petagent
  psql petagent -c "CREATE EXTENSION vector"
  export DATABASE_URL=postgresql://$(whoami)@localhost:5432/petagent
  ```

  ```sh
  # Linux (Debian/Ubuntu)
  sudo apt install postgresql postgresql-17-pgvector  # adjust version
  sudo -u postgres createdb petagent
  sudo -u postgres psql petagent -c "CREATE EXTENSION vector"
  export DATABASE_URL=postgresql://postgres@localhost:5432/petagent
  ```

Clone the repository, then:

```sh
pnpm install
pnpm dev
```

This starts the API server and UI at [http://localhost:3100](http://localhost:3100).

When working from the cloned repo, you can also use:

```sh
pnpm petagentai run
```

This auto-onboards if config is missing, runs health checks with auto-repair, and starts the server.

## What's Next

Once PetAgent is running:

1. Create your first company in the web UI
2. Define a company goal
3. Create a CEO agent and configure its adapter
4. Build out the org chart with more agents
5. Set budgets and assign initial tasks
6. Hit go — agents start their heartbeats and the company runs

<Card title="Core Concepts" href="/start/core-concepts">
  Learn the key concepts behind PetAgent
</Card>
