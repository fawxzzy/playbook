# Architecture Intelligence Graph

Status: **third slice (graph impact, boundaries and risks shipped; `analyze-pr` consumes the graph; semantic layer deferred)**. Card: `PB-V07-ARCH-INTELLIGENCE-GRAPH-001`. The normative contract is [`ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md`](../contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md); the shipped artifact contract is [`repository-graph-contract.md`](../contracts/repository-graph-contract.md).

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
- `graph impact <module|file-path>` (second slice) traverses `depends_on` edges to return transitive dependents and/or dependencies with depth, edge kinds, the shortest path, and a bounded result (`truncated`). It reads the artifact only (plus the index workspace paths, best effort, to map files to modules) and fails closed when the graph is missing or the target is unknown. Contract: [`graph impact`](../contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md#graph-impact-shipped-second-slice).
- Role inference is computed from `depends_on` in/out degree only; it is not stored in the artifact.
- `graph boundaries` (third slice) classifies each module dependency edge against the role matrix that the repository index already declares, and only observes when nothing is declared. It never enforces. Contract: [`graph boundaries`](../contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md#graph-boundaries-shipped-third-slice).
- `graph risks` (third slice) ranks modules by a documented structural score (fan-in, fan-out, transitive dependents, hub score, cycle size) and lists dependency cycles. Contract: [`graph risks`](../contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md#graph-risks-shipped-third-slice).
- `analyze-pr` reads the graph for one additive section, `graphImpact` (changed files to owning modules to transitive dependents), and reports `available: false` with a reason when the graph is missing or invalid. Its existing fields are unchanged: the boundary list still comes from path prefixes (`src/`, `docs/`, `.playbook/`, `.github/`, and similar) and `impact` / `risk` are still index-derived. `query impact` / `query risk` and `explain` do not use the new views.

## Deferred design (not shipped, beyond this card)

The semantic layer is additive on repo-graph 1.x (see the contract for the versioning rule):

1. **Richer entities.** Packages, files, commands, contracts, tests, and docs as nodes, with edges such as `owns`, `tests`, `documents`, and `imports`, each derived from existing index, roadmap, and contract metadata.
2. **Impact index.** A deterministic map from a changed file or module to the commands, contracts, tests, and docs it reaches, keyed by existing graph node ids.
3. **Graph subcommands.** Shipped as module-level views: `graph impact`, `graph boundaries`, `graph risks`. Extending them to commands, contracts, tests and docs depends on the impact index.
4. **Consumers.**
   - `analyze-pr`: the additive `graphImpact` section shipped. Replacing the path-prefix boundary heuristics and the index-derived impact with impact-index lookups is deferred (`SCM context` stays the input; the JSON envelope stays additive).
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

Automated pins today: the compatibility contract test at `tests/contracts/architecture-graph.contract.test.ts` (run in CI through `packages/engine/test/architectureGraphContract.test.ts`; it pins the v1.1 surface, the shipped / deferred lists and schema validity of the new outputs), `packages/engine/test/graphImpact.test.ts`, `graphBoundaries.test.ts`, `graphRisks.test.ts`, `analyzePrGraphImpact.test.ts`, `packages/cli/src/commands/graph.test.ts`, and the `graph-impact`, `graph-boundaries` and `graph-risks` contract snapshots. The semantic layer, the impact index, a v2 artifact and incremental invalidation have no implementation and therefore no tests.
