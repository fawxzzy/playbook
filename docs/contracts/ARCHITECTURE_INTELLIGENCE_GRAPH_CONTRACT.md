# Architecture Intelligence Graph Contract

Status: **second slice (specification + compatibility pin + `graph impact`)**. Card: `PB-V07-ARCH-INTELLIGENCE-GRAPH-001`.

This contract specifies how Playbook's repository graph evolves into a semantic architecture graph that can back `explain`, `query`, and `analyze-pr` impact and risk reasoning. It does **not** ship the semantic layer; only the read-only `graph impact` view over the existing module graph has shipped beyond the first slice. Read the [Status](#status-what-is-shipped-and-what-is-not) section before relying on anything here.

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
- `pnpm playbook graph impact <module|file-path> [--depth N] [--direction dependents|dependencies|both] [--limit N] --json` (second slice, `packages/engine/src/graph/graphImpact.ts`): see [`graph impact`](#graph-impact-shipped-second-slice).

Shipped kind sets (pinned by `tests/contracts/architecture-graph.contract.test.ts`):

- Node kinds: `module`, `repository`, `rule`
- Edge kinds: `contains`, `depends_on`, `governed_by`

Not shipped (each is a future slice of the same card; nothing below exists in the CLI or engine):

- A semantic node/edge layer (for example `package`, `file`, `command`, `contract`, `test`, `doc` nodes; `owns`, `tests`, `documents`, `imports` edges).
- `.playbook/arch-graph.v2.json` or any other new persisted architecture-graph artifact, and a schema registered for it.
- An impact index (changed file or module to affected commands, contracts, tests, docs). The module-to-module traversal that did ship is described below.
- `graph boundaries` and `graph risks` subcommands.
- Incremental (file-hash plus SCM-diff) graph invalidation.
- `analyze-pr` consuming the graph. Today `analyze-pr` derives boundaries from changed-file path prefixes and treats `.playbook/repo-graph.json` only as an excluded runtime artifact; `query impact` and `query risk` derive from the repository index, not from graph edges.
- Boundary-violation detection and graph-backed PR risk scoring.

Until those ship the card is not complete. This document must be updated, not reinterpreted, when a piece ships.

## `graph impact` (shipped, second slice)

Read-only traversal of the shipped graph; it adds no node or edge kind and does not change `.playbook/repo-graph.json` or the `graph` summary output.

- Input: a module name (`auth` or `module:auth`) or a repo-relative file path. A file resolves to the module that owns it: the longest matching root among `src/<module>` and, when `.playbook/repo-index.json` exists, the workspace `path` recorded there for that module. Module nodes carry no paths, so a file outside those roots is an unknown target (fact: this is the same `src/<module>` convention `ask --diff-context` uses).
- Traversal: `depends_on` edges between module nodes only. `dependents` follows edges in reverse (modules that depend on the target, transitively); `dependencies` follows them forward; `both` returns each list.
- Output (`--json`, schema `1.0`): `{ schemaVersion, command: "graph", subcommand: "impact", target: { input, resolvedAs: "module"|"file", module, file? }, direction, depthLimit, limit, truncated, totals, dependents?, dependencies?, graph: { schemaVersion, generatedAt } }`. Each entry is `{ module, depth, edgeKinds, path }`, where `path` is the shortest path in traversal order from the target to the entry (ties broken by the lexicographically smallest module name at each hop), and `edgeKinds` lists the edge kind of each hop.
- Ordering: entries sort by depth, then module name. The target never appears in its own results (cycles terminate).
- Bounds: `--depth` is an integer of at least 1 (default: unlimited); each returned list is capped at `--limit` (default 200, maximum 1000). When any list is cut, `truncated` is `true` and `totals` still reports the full counts.
- Fails closed (non-zero exit; `--json` prints `{ schemaVersion: "1.0", command: "graph", subcommand: "impact", error }`): graph artifact missing, wrong `kind`, or unsupported `schemaVersion` (the errors suggest `playbook index`), unknown target, malformed arguments.
- Not covered: there is no registered JSON schema for the `graph impact` output yet (the `graph` schema covers only the summary), and it does not feed `analyze-pr`, `query`, or `explain`.

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

`tests/contracts/architecture-graph.contract.test.ts` pins the v1.1 compatibility surface: the kind sets above, the current `graph` snapshot, deterministic generation, the exact-version reader behavior, and the existence and cross-references of this document and the architecture document. It deliberately does not test unshipped behavior.
