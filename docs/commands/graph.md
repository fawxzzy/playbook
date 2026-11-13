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

## `graph impact`

Transitive impact over the module dependency edges of `.playbook/repo-graph.json`.

- `pnpm playbook graph impact <module|file-path> [--depth N] [--direction dependents|dependencies|both] [--limit N] --json`
- Target: a module name (`auth`, `module:auth`) or a repo-relative file path. A file resolves to the module that owns it (`src/<module>/...`, or the workspace path recorded in `.playbook/repo-index.json` when present). Anything else is an unknown target.
- `--direction` defaults to `dependents` (modules that would be affected by a change to the target). `--depth` defaults to unlimited; `--limit` caps each returned list (default 200, maximum 1000) and sets `truncated` when it cuts.
- Read-only. Fails with a non-zero exit when the graph is missing, invalid or unsupported (run `pnpm playbook index`), the target is unknown, or an argument is invalid.

```json
{
  "schemaVersion": "1.0",
  "command": "graph",
  "subcommand": "impact",
  "target": { "input": "auth", "resolvedAs": "module", "module": "auth" },
  "direction": "dependents",
  "depthLimit": null,
  "limit": 200,
  "truncated": false,
  "totals": { "dependents": 2 },
  "dependents": [
    { "module": "billing", "depth": 1, "edgeKinds": ["depends_on"], "path": ["auth", "billing"] },
    { "module": "workouts", "depth": 2, "edgeKinds": ["depends_on", "depends_on"], "path": ["auth", "billing", "workouts"] }
  ],
  "graph": { "schemaVersion": "1.1", "generatedAt": "..." }
}
```

Entries are ordered by depth, then module name; `path` is the shortest path from the target. With `--direction both` the result carries both `dependents` and `dependencies`. On failure, `--json` prints `{ "schemaVersion": "1.0", "command": "graph", "subcommand": "impact", "error": "..." }`. No JSON schema is registered for this output yet.

## Not implemented

`graph boundaries` and `graph risks` do not exist, `analyze-pr` does not consume the graph, and `graph impact` does not map files to commands, contracts, tests or docs (module-level only). The planned architecture intelligence layer is specified, but not shipped, in [`ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md`](../contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md).

See also: [`repository-graph-contract.md`](../contracts/repository-graph-contract.md), [`index.md`](./index.md), [`explain.md`](./explain.md), [`query.md`](./query.md).
