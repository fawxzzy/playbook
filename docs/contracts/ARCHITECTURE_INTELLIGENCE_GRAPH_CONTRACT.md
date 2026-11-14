# Architecture Intelligence Graph Contract

Status: **third slice (graph impact, boundaries and risks shipped; `analyze-pr` consumes the graph; semantic layer deferred)**. Card: `PB-V07-ARCH-INTELLIGENCE-GRAPH-001`.

This contract specifies how Playbook's repository graph backs impact and risk reasoning. What ships is a set of read-only views over the existing module graph (`graph impact`, `graph boundaries`, `graph risks`) and a graph-derived `graphImpact` section in `analyze-pr`. It does **not** ship the semantic node/edge layer, and `explain` and `query` do not use the new views. Read the [Status](#status-what-is-shipped-and-what-is-not) section before relying on anything here.

Related contracts:

- [`repository-graph-contract.md`](./repository-graph-contract.md) — the `.playbook/repo-graph.json` stability contract this document extends. It remains authoritative for the shipped artifact.
- [`ARTIFACT_EVOLUTION_POLICY.md`](./ARTIFACT_EVOLUTION_POLICY.md) — persisted-artifact compatibility rules.
- [`COMMAND_CONTRACTS_V1.md`](./COMMAND_CONTRACTS_V1.md) — command contract baseline.
- Architecture view: [`../architecture/ARCHITECTURE_INTELLIGENCE_GRAPH.md`](../architecture/ARCHITECTURE_INTELLIGENCE_GRAPH.md).

## Status: what is shipped and what is not

Shipped today (verifiable in source and `tests/contracts/graph.snapshot.json`):

- `.playbook/repo-graph.json`, kind `playbook-repo-graph`, `schemaVersion` `1.1`, produced by `pnpm playbook index` (`packages/engine/src/graph/repoGraph.ts`).
- Deterministic role inference over module `depends_on` edges (`packages/engine/src/graph/architectureRoleInference.ts`, [`ROLE_INFERENCE.md`](../architecture/ROLE_INFERENCE.md)), surfaced in the `graph` summary as `architectureRoleInference` (schema `1.0`).
- Read surfaces: `pnpm playbook graph` (summary), `explain` and `query` (graph neighborhood for `module:*`, `rule:*`, and `repository:root`).
- `pnpm playbook graph impact <module|file-path> [--depth N] [--direction dependents|dependencies|both] [--limit N] --json` (`packages/engine/src/graph/graphImpact.ts`): see [`graph impact`](#graph-impact-shipped-second-slice).
- `pnpm playbook graph boundaries [--limit N] --json` (`packages/engine/src/graph/graphBoundaries.ts`): see [`graph boundaries`](#graph-boundaries-shipped-third-slice).
- `pnpm playbook graph risks [--limit N] --json` (`packages/engine/src/graph/graphRisks.ts`): see [`graph risks`](#graph-risks-shipped-third-slice).
- `analyze-pr` consumes the graph through an additive `graphImpact` section: see [`analyze-pr` graph consumption](#analyze-pr-graph-consumption-shipped-third-slice).
- The `graph` JSON schema (`pnpm playbook schema graph --json`) covers the summary and the `impact`, `boundaries` and `risks` outputs; `tests/contracts/graph-impact.snapshot.json`, `graph-boundaries.snapshot.json` and `graph-risks.snapshot.json` pin them on the contract fixture.

Shipped kind sets (pinned by `tests/contracts/architecture-graph.contract.test.ts`):

- Node kinds: `module`, `repository`, `rule`
- Edge kinds: `contains`, `depends_on`, `governed_by`

Not shipped, and deferred beyond this card (nothing below exists in the CLI or engine; each needs its own roadmap decision):

- A semantic node/edge layer (for example `package`, `file`, `command`, `contract`, `test`, `doc` nodes; `owns`, `tests`, `documents`, `imports` edges).
- `.playbook/arch-graph.v2.json` or any other new persisted architecture-graph artifact, and a schema registered for it.
- An impact index (changed file or module to affected commands, contracts, tests, docs). Every shipped view is module-to-module.
- Incremental (file-hash plus SCM-diff) graph invalidation. The graph is regenerated in full by `pnpm playbook index`.

Honest limits of what did ship:

- `explain` and `query` are unchanged. They still attach only the per-node graph neighborhood; `query impact` and `query risk` still derive from the repository index (and verify artifacts), not from graph traversal, and neither uses `graph boundaries` or `graph risks`.
- `analyze-pr` keeps its index-derived `impact`, its path-prefix `architecture.boundariesTouched` and its index-derived `risk` exactly as before. The graph adds a separate `graphImpact` section; it does not replace or re-score those fields, and there is no graph-backed PR risk score.
- `graph boundaries` reports against rules that repository intelligence already declares. It is a report, not a gate: nothing is enforced.

The card's goal ("powers explain/query/analyze-pr impact and risk reasoning") is met for `analyze-pr` impact and for graph structural risk and boundary reporting. It is not met for `explain` and `query`, which is stated here rather than implied. This document must be updated, not reinterpreted, when a piece ships.

## `graph impact` (shipped, second slice)

Read-only traversal of the shipped graph; it adds no node or edge kind and does not change `.playbook/repo-graph.json` or the `graph` summary output.

- Input: a module name (`auth` or `module:auth`) or a repo-relative file path. A file resolves to the module that owns it: the longest matching root among `src/<module>` and, when `.playbook/repo-index.json` exists, the workspace `path` recorded there for that module. Module nodes carry no paths, so a file outside those roots is an unknown target (fact: this is the same `src/<module>` convention `ask --diff-context` uses).
- Traversal: `depends_on` edges between module nodes only. `dependents` follows edges in reverse (modules that depend on the target, transitively); `dependencies` follows them forward; `both` returns each list.
- Output (`--json`, schema `1.0`): `{ schemaVersion, command: "graph", subcommand: "impact", target: { input, resolvedAs: "module"|"file", module, file? }, direction, depthLimit, limit, truncated, totals, dependents?, dependencies?, graph: { schemaVersion, generatedAt } }`. Each entry is `{ module, depth, edgeKinds, path }`, where `path` is the shortest path in traversal order from the target to the entry (ties broken by the lexicographically smallest module name at each hop), and `edgeKinds` lists the edge kind of each hop.
- Ordering: entries sort by depth, then module name. The target never appears in its own results (cycles terminate).
- Bounds: `--depth` is an integer of at least 1 (default: unlimited); each returned list is capped at `--limit` (default 200, maximum 1000). When any list is cut, `truncated` is `true` and `totals` still reports the full counts.
- Fails closed (non-zero exit; `--json` prints `{ schemaVersion: "1.0", command: "graph", subcommand: "impact", error }`): graph artifact missing, wrong `kind`, or unsupported `schemaVersion` (the errors suggest `playbook index`), unknown target, malformed arguments.
- Schema: covered by the `graph` JSON schema and pinned by `tests/contracts/graph-impact.snapshot.json`.

## `graph boundaries` (shipped, third slice)

Read-only classification of every module-to-module `depends_on` edge in the graph. It invents no layering policy.

- Declared rules: when `.playbook/repo-index.json` carries `architectureRoleInference` with a `dependencyMatrix` and at least one role node (written by `pnpm playbook index` for workspace repositories), each edge is classified against that declared matrix using the declared role of both modules: `allowed`, `out_of_direction`, or `unclassified` (a module without a declared role, or a role missing from the matrix). `violations` lists the `out_of_direction` edges.
- No declared rules (no index, an index without roles such as a non-workspace repository, or an unreadable index): `rules.declared` is `false` with a `reason`, roles come from graph topology (`graph-inferred`, the same inference as the `graph` summary), every edge has status `observed`, and `violations` is empty. Nothing is judged.
- `enforced` mirrors the declared `policyEnforcement`: `true` only when it is something other than `none`. The indexer writes `none` (and `classificationMode: observation-only`), so `enforced` is `false` in every repository today. The exit code never depends on findings.
- Output (`--json`, schema `1.0`): `{ schemaVersion, command: "graph", subcommand: "boundaries", enforced, rules: { declared, source, reason?, classifierVersion, policyEnforcement, dependencyMatrix }, roles: [{ module, role, source }], summary: { modules, edges, allowed, violations, unclassified, observed }, limit, truncated, totals: { violations, observations }, violations, observations, graph: { schemaVersion, generatedAt } }`. Each edge is `{ from, to, fromRole, toRole, status }`.
- Ordering and bounds: edges sort by `from`, then `to`; `roles` by module name. `violations` and `observations` are each capped at `--limit` (default 200, maximum 1000) with `truncated` and `totals`.
- Fails closed (non-zero exit, `{ schemaVersion: "1.0", command: "graph", subcommand: "boundaries", error }`): graph missing, wrong `kind`, unsupported `schemaVersion`, or malformed arguments. A missing or unusable index is not a failure; it only removes the declared rules.
- Fact about the declared matrix: it allows `interface` to depend on `foundation` and `adapter` only, so an `interface` package that depends on an `orchestration` package is reported as `out_of_direction`. In this repository that flags the CLI-to-engine edge; the repository index reports the same edge in `dependencyObservations`. Whether the matrix or the dependency should change is a product decision this command does not make.

## `graph risks` (shipped, third slice)

Structural risk signals per module, computed from the graph's module `depends_on` edges only (no index, verify, ownership or history input).

- Signals per module: `fanIn` (direct dependents), `fanOut` (direct dependencies), `transitiveDependents`, `transitiveDependencies`, `inCycle`, `cycleSize` (modules in its dependency cycle; `0` outside a cycle, `1` for a self-dependency), `depth` (dependency layers beneath the module: `0` with no dependencies outside its own cycle, otherwise one more than its deepest dependency; modules in one cycle share a depth), `hubScore`, and `score`.
- Formula (schema `1.0`, also emitted in the output as `formula`):
  - `hubScore = fanIn * fanOut`
  - `score = 2 * transitiveDependents + fanIn + fanOut + hubScore + 3 * cycleSize`
  - `depth` is reported but is not part of the score. The weights are fixed constants; changing a weight or a term requires a `schemaVersion` bump. The score ranks modules within one repository; it has no absolute meaning and no low/medium/high thresholds.
- Output (`--json`): `{ schemaVersion, command: "graph", subcommand: "risks", formula: { hubScore, score, weights }, limit, truncated, totals: { modules, cycles }, modules, cycles, graph: { schemaVersion, generatedAt } }`.
- Ordering and bounds: `modules` sort by score (highest first), then module name. `cycles` lists each cycle's modules sorted by name, ordered by size (largest first), then first module. Both lists are capped at `--limit` (default 200, maximum 1000) with `truncated` and `totals`.
- Fails closed like `graph boundaries`.
- This is not the `query risk` score: that one is index-derived, includes verify failures, and is unchanged.

## `analyze-pr` graph consumption (shipped, third slice)

`analyze-pr --json` gains one additive top-level field, `graphImpact`, after the existing fields. No existing field, ordering or exit code changes.

- When `.playbook/repo-graph.json` is valid: `{ available: true, schemaVersion: "1.0", graphSchemaVersion: "1.1", limit, truncated, totals: { changedModules, affectedModules, unmappedFiles }, changedModules: [{ module, changedFileCount, totalDependents, dependents: [{ module, depth }] }], affectedModules }`. Changed files map to their owning module (the same resolution as `graph impact`; a file outside every module root counts in `totals.unmappedFiles`), and each changed module lists its transitive dependents by depth, then name. `affectedModules` is the changed modules plus all their dependents, sorted by name.
- When the graph is missing, has the wrong kind, or an unsupported version: `{ available: false, reason }`. `analyze-pr` still succeeds or fails exactly as before.
- Bounds: every list is capped at 50 entries; `truncated` is `true` when any list is cut and `totals` keeps the full counts.
- The text, `github-comment` and `github-review` formats do not render `graphImpact`.
- Fact about coverage: the committed `tests/contracts/analyze-pr.snapshot.json` is the error payload of a non-git fixture, so it does not show `graphImpact`. The field is covered by the `analyze-pr` JSON schema and by `packages/engine/test/analyzePrGraphImpact.test.ts`.

## Versioning decision: additive 1.x, not a breaking v2

Earlier planning text ([`PLAYBOOK_EXECUTION_SYSTEM_V1.md`](../roadmap/PLAYBOOK_EXECUTION_SYSTEM_V1.md), section 8) sketched a `2.0` semantic graph that "supersedes" the repo graph. That sketch is not adopted. The semantic architecture graph is specified as **additive layers on `playbook-repo-graph` 1.x**, because the repo-graph contract already permits additive node kinds, edge kinds, optional fields, and deterministic derived nodes/edges under a minor bump.

Rules:

1. Existing required top-level keys (`schemaVersion`, `kind`, `nodes`, `edges`, `stats`) and the semantics of the three shipped node kinds and three shipped edge kinds do not change within 1.x.
2. New node kinds, edge kinds, and optional fields bump the artifact `schemaVersion` minor (`1.1` to `1.2`, and so on). New kinds must be derivable from existing repository truth (index, rule metadata, SCM diff) and deterministically ordered.
3. A separate artifact (for example an impact index) may be added alongside `repo-graph.json` instead of inside it. It must carry its own `kind` and `schemaVersion`, be registered through the contract/schema registries, and reference `repo-graph.json` node ids rather than redefining them.
4. A major bump (`2.0`) is reserved for the breaking changes listed in the repo-graph contract. Choosing one requires a new decision recorded in the roadmap.
5. Reader strictness caveat (fact): `readRepositoryGraph` currently requires `schemaVersion` to equal exactly `1.1` and rejects any other value, including a minor bump. The first slice that bumps the minor version must update the reader (to accept `1.x` and tolerate unknown kinds, as the repo-graph consumer notes already require), the `graph` result schema, and the contract snapshots in the same change.

## Compatibility guarantees for consumers

- Branch by `schemaVersion`; treat `kind` plus `schemaVersion` as the handshake.
- Tolerate unknown node and edge kinds you do not need.
- Do not assert on `generatedAt`.
- Within a `schemaVersion`, node and edge ordering is deterministic (nodes by kind, name, id; edges by kind, from, to).

## Explicit non-goals

- No breaking replacement of `.playbook/repo-graph.json` in this card.
- No broad heuristic or model-based inference: only low-cost relationships derivable from trusted metadata.
- No mutation or remediation path. Graph surfaces are read-only; `plan`/`apply` stay the only mutation route.
- No network access, no hosted graph service.
- No change to `explain`, `query`, or `analyze-pr` output contracts without an additive, snapshot-covered change.

## Verification today

`tests/contracts/architecture-graph.contract.test.ts` pins the v1.1 compatibility surface (kind sets, the `graph` snapshot, deterministic generation, the exact-version reader behavior, the existence and cross-references of this document and the architecture document), the shipped / deferred lists above, and that the `impact`, `boundaries`, `risks` and `analyze-pr` `graphImpact` outputs validate against their registered JSON schemas. It runs in CI through `packages/engine/test/architectureGraphContract.test.ts`. Behavior is covered by `packages/engine/test/graphImpact.test.ts`, `graphBoundaries.test.ts`, `graphRisks.test.ts`, `analyzePrGraphImpact.test.ts` and `packages/cli/src/commands/graph.test.ts`. Nothing tests the deferred pieces because they do not exist.
