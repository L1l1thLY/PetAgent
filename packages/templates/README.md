# @petagent/templates

Bundled starter templates for PetAgent companies, packaged in the
[agentcompanies/v1](../../docs/companies/companies-spec.md) format
(markdown packages with YAML frontmatter, plus a `.petagent.yaml`
sidecar for PetAgent-specific fidelity).

## Templates

| Template          | Agents | Best for                                                                                |
| ----------------- | ------ | --------------------------------------------------------------------------------------- |
| `solo-pack`       | 3      | Smallest viable PetAgent: 1 coordinator + 1 executor + 1 psychologist                   |
| `small-dev-team`  | 8      | Two-coordinator engineering shop: CEO + CTO + 1 explorer + 1 planner + 2 executors + 1 reviewer + 1 psychologist |
| `hybrid-team`     | 6      | PetAgent coord + planner + reviewer + psychologist plus two `claude_local` executors with double-review semantics |

Each template is a self-contained directory under this package and can
be imported by the PetAgent server's company importer or copied to a
new directory and customized.

## Layout

```
solo-pack/
├── COMPANY.md
├── agents/
│   ├── coordinator-1/AGENTS.md
│   ├── executor-1/AGENTS.md
│   └── therapist/AGENTS.md
└── .petagent.yaml
```

The base markdown package is vendor-neutral. PetAgent-specific
fidelity (adapter type, role binding, monthly USD budget) lives in
`.petagent.yaml` per spec §15.

## Programmatic API

```ts
import {
  TEMPLATE_NAMES,
  resolveTemplateRoot,
  listTemplates,
} from "@petagent/templates";

console.log(TEMPLATE_NAMES); // ["solo-pack", "small-dev-team", "hybrid-team"]

const dir = resolveTemplateRoot("solo-pack");
// /abs/path/to/packages/templates/solo-pack
```

## Hybrid Team — double-review semantics

The hybrid template includes external `claude_local` executors. When
the PetAgent coordinator dispatches an Issue to a Claude Code
executor, the executor's `selfReviewsImplementation: true` flag in
`.petagent.yaml` tells the coordinator that Claude Code already
performs a self-review pass. The PetAgent Reviewer-1 agent still
audits the result independently — Claude Code's self-review never
substitutes for the PetAgent Reviewer's adversarial probes. See spec
§3.4 for the rationale (the Reviewer's job is to break the
implementation, not to confirm it).
