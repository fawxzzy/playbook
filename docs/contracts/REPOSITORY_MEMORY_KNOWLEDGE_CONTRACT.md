# Repository Memory Knowledge Contract

## Purpose

Define deterministic replay/consolidation behavior for `.playbook/memory/*` episodic events and explicit promotion/pruning boundaries for durable local semantic memory artifacts.

## Memory classes

1. **Structural intelligence**
   - `.playbook/repo-index.json`
   - `.playbook/repo-graph.json`
2. **Working context**
   - `.playbook/context/*`
3. **Episodic memory**
   - `.playbook/memory/events/*.json`
   - `.playbook/memory/index.json`
4. **Replay/consolidation candidates**
   - `.playbook/memory/candidates.json`
5. **Local semantic memory (reviewed, non-doctrine by default)**
   - `.playbook/memory/knowledge/decisions.json`
   - `.playbook/memory/knowledge/patterns.json`
   - `.playbook/memory/knowledge/failure-modes.json`
   - `.playbook/memory/knowledge/invariants.json`
6. **Doctrine/policy memory**
   - rules, contracts, docs, and remediation templates

Pattern: Structural Graph + Memory Graph/Index.

## Replay and promotion pipeline

Canonical flow:

`replay -> promote (human-reviewed) -> prune`

Pattern: **Fast Episodic Store, Slow Doctrine Store**.
Pattern: **Replay Before Promotion**.
Pattern: **Human-Reviewed Knowledge Promotion**.

Promotion requirements:

- candidate id from replay artifact
- provenance preservation (`eventId`, `sourcePath`, run linkage)
- supersession links (`supersedes`, `supersededBy`) where applicable

Rule: **Working Memory Is Not Doctrine**.

Promotion into `.playbook/memory/knowledge/*` does **not** automatically rewrite committed rules/docs/contracts.

## Pruning semantics

Pruning is deterministic and local-memory scoped:

- stale candidate expiration (`lastSeenAt`)
- superseded knowledge cleanup
- duplicate collapse by fingerprint

Rule: Replay/prune operations must never mutate governance doctrine artifacts automatically.

### Promotion, demotion, and prune workflow

Every transition is explicit, human-invoked, and provenance-preserving. Nothing runs automatically.

| Transition | Command | Effect | Provenance |
| --- | --- | --- | --- |
| Promote (candidate -> knowledge) | `memory promote <candidate-id>` | writes an `active` entry; an `active` entry with the same fingerprint becomes `superseded` | entry keeps candidate id, event provenance, and `supersedes` links |
| Supersede (knowledge -> knowledge) | `memory supersede <id> --by <successor-id>` | `<id>` becomes `superseded`; same-kind records only | `<id>.supersededBy` and `<successor>.supersedes` link both ways |
| Demote (retire) | `memory retire <id> [--reason <text>]` | `<id>` becomes `retired` with `retiredAt` and `retirementReason`; not deleted | original provenance retained |
| Prune preview | `memory prune` (default, `--dry-run`) | read-only list of removals with reason | none removed |
| Prune apply | `memory prune --apply` | deletes exactly the previewed stale/duplicate/superseded records | successor's `supersedes` pointer remains |

Rule: **Prune is preview-first.** `memory prune` must be a dry-run unless `--apply` is passed, and `--apply` removes exactly the set the preview lists.
Rule: Retired records are demoted, not deleted; only superseded, duplicate, and stale records are removable by prune.
Pattern: **Compact Doctrine Through Reviewed Transitions** - promote, supersede, retire, and prune are the only paths by which `.playbook/memory/knowledge/*` grows or shrinks.

## Retrieval guidance

Memory-aware retrieval (shipped, opt-in: `--with-memory` on `query` and `explain`, `--with-repo-context-memory` on `ask --repo-context`; see `docs/commands/query.md`) composes:

1. structural context from `.playbook/repo-index.json` + `.playbook/repo-graph.json`
2. relevant episodic events from `.playbook/memory/index.json`
3. promoted local semantic memory artifacts
4. committed governance doctrine where explicitly reviewed and adopted (shipped as `doctrineHits`: only `lifecycle: promoted` records of `docs/doctrine/atlas-engineering-doctrine-registry.v1.json`; a missing or unreadable registry yields no hits, not an error; `packages/engine/src/intelligence/runtimeMemory.ts`)

Rule: **Retrieval Must Return Provenance**.

## Failure modes

Failure Mode: **Memory Hoarding**.
Failure Mode: **Premature Canonicalization**.
Failure Mode: **Rebuilding Durable Memory From Current Repo State Only**.
Failure Mode: **Candidate Flood From Low-Signal Events**.
