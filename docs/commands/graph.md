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

Entries are ordered by depth, then module name; `path` is the shortest path from the target. With `--direction both` the result carries both `dependents` and `dependencies`. On failure, `--json` prints `{ "schemaVersion": "1.0", "command": "graph", "subcommand": "impact", "error": "..." }`.

## `graph boundaries`

Classifies every module-to-module dependency edge of `.playbook/repo-graph.json` against the architecture rules the repository already declares.

- `pnpm playbook graph boundaries [--limit N] --json`
- Declared rules come from `.playbook/repo-index.json` (`architectureRoleInference`: module roles plus the dependency-direction matrix, written by `pnpm playbook index` for workspace repositories). With them, each edge is `allowed`, `out_of_direction` or `unclassified`, and `violations` lists the out-of-direction edges.
- Without declared rules the command only observes: `rules.declared` is `false` with a `reason`, roles are inferred from graph topology, every edge is `observed`, and `violations` is empty.
- `enforced` is `false` today in every repository (the index declares `policyEnforcement: "none"`). This is a report: the exit code never depends on findings.
- Fails with a non-zero exit only when the graph is missing, invalid or unsupported (run `pnpm playbook index`) or an argument is invalid.

```json
{
  "schemaVersion": "1.0",
  "command": "graph",
  "subcommand": "boundaries",
  "enforced": false,
  "rules": {
    "declared": true,
    "source": ".playbook/repo-index.json#architectureRoleInference",
    "classifierVersion": "role-heuristic-v1",
    "policyEnforcement": "none",
    "dependencyMatrix": { "interface": ["adapter", "foundation"], "foundation": ["foundation"] }
  },
  "roles": [{ "module": "cli", "role": "interface", "source": "declared" }],
  "summary": { "modules": 3, "edges": 3, "allowed": 2, "violations": 1, "unclassified": 0, "observed": 0 },
  "limit": 200,
  "truncated": false,
  "totals": { "violations": 1, "observations": 3 },
  "violations": [{ "from": "core", "to": "cli", "fromRole": "foundation", "toRole": "interface", "status": "out_of_direction" }],
  "observations": [],
  "graph": { "schemaVersion": "1.1", "generatedAt": "..." }
}
```

(`observations` lists every edge, including the violations; it is shortened here.)

## `graph risks`

Ranks modules by structural risk computed from the graph only.

- `pnpm playbook graph risks [--limit N] --json`
- Per module: `fanIn`, `fanOut`, `transitiveDependents`, `transitiveDependencies`, `inCycle`, `cycleSize`, `depth`, `hubScore`, `score`. `cycles` lists each dependency cycle.
- Formula: `hubScore = fanIn * fanOut`; `score = 2 * transitiveDependents + fanIn + fanOut + hubScore + 3 * cycleSize`. `depth` (dependency layers beneath the module) is reported but not scored. The score ranks modules inside one repository; it has no thresholds.
- Ordered by score (highest first), then module name; both lists are capped at `--limit` (default 200, maximum 1000) with `truncated` and `totals`.
- Different from `query risk`, which is index-derived, includes verify failures, and is unchanged.

```json
{
  "schemaVersion": "1.0",
  "command": "graph",
  "subcommand": "risks",
  "formula": {
    "hubScore": "fanIn * fanOut",
    "score": "2 * transitiveDependents + fanIn + fanOut + hubScore + 3 * cycleSize",
    "weights": { "transitiveDependents": 2, "fanIn": 1, "fanOut": 1, "hubScore": 1, "cycleSize": 3 }
  },
  "limit": 200,
  "truncated": false,
  "totals": { "modules": 1, "cycles": 0 },
  "modules": [
    { "module": "auth", "score": 6, "fanIn": 2, "fanOut": 0, "transitiveDependents": 2, "transitiveDependencies": 0, "inCycle": false, "cycleSize": 0, "depth": 0, "hubScore": 0 }
  ],
  "cycles": [],
  "graph": { "schemaVersion": "1.1", "generatedAt": "..." }
}
```

The JSON schema for all four outputs is `pnpm playbook schema graph --json`.

## Not implemented

The graph views are module-level only: nothing maps files to commands, contracts, tests or docs (no impact index), there is no semantic node/edge layer and no incremental graph update, and `explain` and `query` do not use these views. `graph boundaries` never enforces. Those pieces are deferred beyond the current card; see [`ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md`](../contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md).

See also: [`repository-graph-contract.md`](../contracts/repository-graph-contract.md), [`index.md`](./index.md), [`explain.md`](./explain.md), [`query.md`](./query.md).
