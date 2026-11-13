# Architecture Intelligence Graph

Status: **first slice (design + current-state audit)**. Card: `PB-V07-ARCH-INTELLIGENCE-GRAPH-001`. The normative contract is [`ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md`](../contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md); the shipped artifact contract is [`repository-graph-contract.md`](../contracts/repository-graph-contract.md).

## Purpose

Make the repository graph a reusable reasoning substrate so `explain`, `query`, and `analyze-pr` answer "what does this change touch and how risky is it" from one deterministic structure instead of each command re-deriving it.

## Current state (shipped)

```text
repo-index.json  --index-->  repo-graph.json (playbook-repo-graph 1.1)
                                   |
        +--------------------------+---------------------------+
        |                          |                           |
   graph (summary +        explain / query            role inference
   top dependency hubs)    (graph neighborhood        (interface / orchestration /
                           for module, rule, root)     foundation / adapter)
```

- Nodes: `repository`, `module`, `rule`. Edges: `contains`, `depends_on`, `governed_by`.
- `graph` is a read-only summary of the artifact. `explain` and `query` attach a per-node neighborhood (incoming/outgoing edges).
- Role inference is computed from `depends_on` in/out degree only; it is not stored in the artifact.
- `analyze-pr` does not read the graph. Its boundary list comes from path prefixes (`src/`, `docs/`, `.playbook/`, `.github/`, and similar), and `query impact` / `query risk` are index-derived.

## Target design (not shipped)

The semantic layer is additive on repo-graph 1.x (see the contract for the versioning rule):

1. **Richer entities.** Packages, files, commands, contracts, tests, and docs as nodes, with edges such as `owns`, `tests`, `documents`, and `imports`, each derived from existing index, roadmap, and contract metadata.
2. **Impact index.** A deterministic map from a changed file or module to the commands, contracts, tests, and docs it reaches, keyed by existing graph node ids.
3. **Graph subcommands.** `graph impact`, `graph boundaries`, `graph risks` as read-only views over the above.
4. **Consumers.**
   - `analyze-pr`: replace path-prefix boundary heuristics with impact-index lookups for the changed files (`SCM context` stays the input), keeping the current JSON envelope additive.
   - `explain`: extend the neighborhood with the new entity kinds and the impact path that led to them.
   - `query`: serve `impact` and `risk` from graph traversal, with the index remaining the fallback when the graph artifact is absent.
5. **Incremental updates.** File-hash invalidation plus SCM diff deltas, so regeneration cost scales with the change.

## Boundaries

- Owner split: graph shape and generation live in `@zachariahredfield/playbook-engine` (`packages/engine/src/graph`); CLI commands in `@fawxzzy/playbook` stay thin adapters; SCM inputs come from `@zachariahredfield/playbook-node` and core. Contracts and schemas are registered in `packages/contracts`.
- The graph is derived state. It must be regenerable from repository truth (`playbook index`) and never become a source of truth that other artifacts cannot be rebuilt from.
- All outputs are local-first, deterministic, and read-only.

## Risks

| Risk | Why it matters | Mitigation in the design |
| --- | --- | --- |
| Reader rejects any version other than `1.1` | A minor bump would break every consumer that calls `readRepositoryGraph` | First bumping slice updates the reader to accept `1.x`, tolerates unknown kinds, and updates snapshots together |
| Heuristic creep | Semantic edges can quietly become guesses, undermining explainability | Only metadata-derived edges; every edge kind documented in the contract with its derivation |
| Graph size and regeneration cost | File-level nodes grow with repo size | Incremental invalidation; keep file nodes optional or scoped |
| Two diverging boundary sources | `analyze-pr` path prefixes and graph boundaries could disagree during migration | Migrate `analyze-pr` behind additive fields; keep a contract test comparing both on fixtures |
| Contract drift between the plan and the shipped artifact | The execution-system sketch says `2.0` and `depends-on`; the shipped artifact is `1.1` and `depends_on` | This document and the contract state the additive-1.x decision; the roadmap text should be trimmed to what is real |

## Verification

The only automated pin today is the v1.1 compatibility contract test at `tests/contracts/architecture-graph.contract.test.ts`. Impact analysis, boundary detection, and risk scoring have no graph-backed implementation and therefore no graph-backed tests yet.
