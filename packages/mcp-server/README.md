# PetAgent MCP Server

Model Context Protocol server for PetAgent.

This package is a thin MCP wrapper over the existing PetAgent REST API. It does
not talk to the database directly and it does not reimplement business logic.

## Authentication

The server reads its configuration from environment variables:

- `PAPERCLIP_API_URL` - PetAgent base URL, for example `http://localhost:3100`
- `PAPERCLIP_API_KEY` - bearer token used for `/api` requests
- `PAPERCLIP_COMPANY_ID` - optional default company for company-scoped tools
- `PAPERCLIP_AGENT_ID` - optional default agent for checkout helpers
- `PAPERCLIP_RUN_ID` - optional run id forwarded on mutating requests

## Usage

```sh
npx -y @petagentai/mcp-server
```

Or locally in this repo:

```sh
pnpm --filter @petagentai/mcp-server build
node packages/mcp-server/dist/stdio.js
```

## Tool Surface

Read tools:

- `petagentMe`
- `petagentInboxLite`
- `petagentListAgents`
- `petagentGetAgent`
- `petagentListIssues`
- `petagentGetIssue`
- `petagentGetHeartbeatContext`
- `petagentListComments`
- `petagentGetComment`
- `petagentListIssueApprovals`
- `petagentListDocuments`
- `petagentGetDocument`
- `petagentListDocumentRevisions`
- `petagentListProjects`
- `petagentGetProject`
- `petagentListGoals`
- `petagentGetGoal`
- `petagentListApprovals`
- `petagentGetApproval`
- `petagentGetApprovalIssues`
- `petagentListApprovalComments`

Write tools:

- `petagentCreateIssue`
- `petagentUpdateIssue`
- `petagentCheckoutIssue`
- `petagentReleaseIssue`
- `petagentAddComment`
- `petagentUpsertIssueDocument`
- `petagentRestoreIssueDocumentRevision`
- `petagentCreateApproval`
- `petagentLinkIssueApproval`
- `petagentUnlinkIssueApproval`
- `petagentApprovalDecision`
- `petagentAddApprovalComment`

Escape hatch:

- `petagentApiRequest`

`petagentApiRequest` is limited to paths under `/api` and JSON bodies. It is
meant for endpoints that do not yet have a dedicated MCP tool.
