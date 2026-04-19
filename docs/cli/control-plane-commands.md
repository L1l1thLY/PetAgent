---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm petagentai issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm petagentai issue get <issue-id-or-identifier>

# Create issue
pnpm petagentai issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm petagentai issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm petagentai issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm petagentai issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm petagentai issue release <issue-id>
```

## Company Commands

```sh
pnpm petagentai company list
pnpm petagentai company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm petagentai company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm petagentai company import \
  <owner>/<repo>/<path> \
  --target existing \
  --company-id <company-id> \
  --ref main \
  --collision rename \
  --dry-run

# Apply import
pnpm petagentai company import \
  ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm petagentai agent list
pnpm petagentai agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm petagentai approval list [--status pending]

# Get approval
pnpm petagentai approval get <approval-id>

# Create approval
pnpm petagentai approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm petagentai approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm petagentai approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm petagentai approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm petagentai approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm petagentai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm petagentai activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm petagentai dashboard get
```

## Heartbeat

```sh
pnpm petagentai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
