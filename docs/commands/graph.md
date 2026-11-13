# `pnpm playbook graph`

Summarize the machine-readable repository knowledge graph from `.playbook/repo-graph.json`.

## Usage

- `pnpm playbook graph`
- `pnpm playbook graph --json`
- `pnpm playbook graph --quiet`

## Behavior

- Read-only. It does not regenerate the graph; run `pnpm playbook index` first to produce `.playbook/repo-graph.json`.
- Fails (non-zero exit) when the artifact is missing, has the wrong `kind`, or has a `schemaVersion` other than the one the CLI supports (`1.1`).
- Text mode prints kind, schema version, generation time, node and edge counts, node and edge kinds, and the top dependency hubs. `--quiet` suppresses text output.

## JSON contract

```json
{
  "schemaVersion": "1.1",
  "command": "graph",
  "graph": {
    "schemaVersion": "1.1",
    "kind": "playbook-repo-graph",
    "generatedAt": "...",
    "stats": { "nodeCount": 0, "edgeCount": 0, "nodeKinds": {}, "edgeKinds": {} },
    "nodeKinds": ["module", "repository", "rule"],
    "edgeKinds": ["contains", "depends_on", "governed_by"],
    "topDependencyHubs": [{ "module": "...", "incomingDependencies": 0 }],
    "architectureRoleInference": { "schemaVersion": "1.0", "roles": [] }
  }
}
```

On failure, `--json` prints `{ "schemaVersion": "1.1", "command": "graph", "error": "..." }`.

## Not implemented

There are no `graph` subcommands today (no `graph impact`, `graph boundaries`, or `graph risks`). The planned architecture intelligence layer is specified, but not shipped, in [`ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md`](../contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md).

See also: [`repository-graph-contract.md`](../contracts/repository-graph-contract.md), [`index.md`](./index.md), [`explain.md`](./explain.md), [`query.md`](./query.md).
