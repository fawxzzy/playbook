# Playbook Knowledge Persistence Layer

## Purpose

This document maps what Playbook already persists to the goal of roadmap card `PB-V09-KNOWLEDGE-PERSISTENCE-001`:

> Define the post-observation persistence layer that retains deterministic evidence and knowledge artifacts with explicit lifecycle boundaries before broader platform scheduling.

It is a map of existing behavior, written from the code. It introduces no new runtime behavior, command, or schema. Where the card goal asks for more than the code provides, that is stated under "Not persisted / not guaranteed".

## Goal clauses and current coverage

| Goal clause | Current coverage | Where |
| --- | --- | --- |
| Post-observation | Persistence starts after deterministic command outputs exist (events captured from verify/plan/apply/analyze-pr, structural index/graph). Nothing in this layer observes the repository itself. | `packages/engine/src/memory/index.ts`, `docs/contracts/REPOSITORY_MEMORY_EVENT_CONTRACT.md` |
| Retains deterministic evidence | Episodic events with fingerprints and sources, replay candidates with provenance, the session evidence envelope. Files are written as deterministic JSON. | `.playbook/memory/events/*.json`, `.playbook/memory/index.json`, `.playbook/memory/candidates.json`, `.playbook/session-evidence.json` |
| Retains knowledge artifacts | Reviewed local semantic memory and reviewed promoted patterns. | `.playbook/memory/knowledge/*.json`, `.playbook/patterns-promoted.json` |
| Explicit lifecycle boundaries | Human-reviewed promotion, explicit retire and supersede, and a separate prune function. Several parallel lifecycle models exist (see below). | `docs/contracts/REPOSITORY_MEMORY_KNOWLEDGE_CONTRACT.md`, `packages/engine/src/memory/knowledge.ts` |
| Before broader platform scheduling | Nothing in this layer schedules work; promotion is an explicit operator action. | n/a |

## What exists

### Episodic evidence
- `.playbook/memory/events/<eventInstanceId>.json` and `.playbook/memory/index.json`, defined in `docs/contracts/REPOSITORY_MEMORY_EVENT_CONTRACT.md`. Capture is admission-controlled and best effort.
- `.playbook/memory/candidates.json` (compat copy of `replay-candidates.json`) holds replay candidates with provenance (`eventId`, `sourcePath`, fingerprint, `runId`) and `lastSeenAt`.

### Local semantic memory (`.playbook/memory/knowledge/*`)
- Four files: `decisions.json`, `patterns.json`, `failure-modes.json`, `invariants.json`, listed in `docs/contracts/REPOSITORY_MEMORY_KNOWLEDGE_CONTRACT.md`.
- Entries are written by `playbook memory promote <candidate-id>` after review, and carry `knowledgeId`, source candidate ids, source event fingerprints, `promotedAt`, `provenance`, `status`, `supersedes` / `supersededBy`, `retiredAt`, and `retirementReason`.
- `playbook memory retire <knowledge-id>` marks an entry retired without deleting provenance; supersession is recorded on the entries.
- Read side: `packages/core/src/knowledge/store.ts` (`listKnowledge`, `queryKnowledge`, `getKnowledgeProvenance`, `getKnowledgeTimeline`, `getStaleKnowledge`, `getKnowledgeSupersession`, `compareKnowledge`) normalizes memory events, candidates, knowledge entries, global pattern memory, and lifecycle candidates into one record shape. The default staleness window is 45 days. The operator surface is `playbook knowledge` (`docs/commands/knowledge.md`).

### Promoted patterns (`.playbook/patterns-promoted.json`)
- Written by the reviewed pattern-promotion path in `packages/engine/src/compaction/promotionQueue.ts`: an approved candidate is removed from `.playbook/pattern-review-queue.json` and added (by id, sorted) to `promotedPatterns` with its review record (`decidedBy: human-reviewed-local`, rationale, timestamp). Rejected candidates are not written to this file.

### Lifecycle models (they are not one model)
1. Core internal model, `packages/core/src/knowledge/knowledge-lifecycle.ts`: states `candidate`, `compacted`, `promoted`, `retired`. Transitions are enforced (`createCandidate -> compactCandidate -> promoteKnowledge -> retireKnowledge`), ids are derived deterministically from the canonical representation, evidence is sorted, and supersession ids are tracked. It is covered by `packages/core/test/knowledge-lifecycle.test.ts`. It is not re-exported from the core package index and is not called from the engine or CLI; treat it as the internal contract, not a wired persistence path.
2. Core memory contract, `packages/core/src/contracts/memory.ts`: `memoryLifecycleStates` are `candidate`, `promoted`, `retired`, with `memoryArtifactPaths` for knowledge candidates, promoted knowledge, replay, and compaction outputs under `.playbook/memory/`.
3. Store read model, `packages/core/src/knowledge/types.ts`: lifecycle states `observed`, `candidate`, `active`, `stale`, `retired`, `superseded`, `demoted`, used for presenting records.
4. On-disk entry `status` values written by the engine in `.playbook/memory/knowledge/*.json` (for example `retired` set by `memory retire`).

### Compaction
- `decideKnowledgeCompaction` (`packages/core/src/knowledge/compaction/`) is deterministic and review-oriented (`docs/architecture/KNOWLEDGE_COMPACTION_PHASE.md`). It produces review drafts; it does not promote.

### Pruning (`pruneMemoryKnowledge`, `packages/engine/src/memory/knowledge.ts`)
- Removes replay candidates whose `lastSeenAt` is older than 30 days.
- Collapses duplicate candidates and duplicate knowledge entries by fingerprint (keeps the most recently promoted entry).
- Removes knowledge entries whose status is `superseded` or that have `supersededBy` links. This deletes those entries from the file, which differs from `memory retire`, which keeps the record.
- Covered by `packages/engine/test/memoryKnowledge.test.ts`. The function is exported from the engine; no CLI command invoking it was found in `packages/cli/src` (only a type declaration), so pruning is not currently an operator-facing command.

### Provenance and retention
- Provenance: promotion requires a candidate id and preserves event and run linkage; retrieval is required to return provenance (`Rule: Retrieval Must Return Provenance`).
- Retention classes are policy inputs documented in `docs/commands/memory.md`: `canonical` (includes promoted knowledge), `compactable` (events, index, candidate artifacts), and `disposable`. Memory-pressure inspection (`.playbook/memory-pressure.json`, `.playbook/memory-pressure-plan.json`) is read-only reporting.

## Not persisted / not guaranteed

- Local semantic memory is local runtime state under `.playbook/`; there is no guaranteed commit, backup, or sync of it. Memory artifacts are gitignore-oriented by default.
- No time-based or size-based automatic expiry of events or promoted knowledge. Pressure plans are advisory; stale-candidate pruning exists as a function but is not scheduled.
- No automatic promotion. Replay, consolidation, and compaction never write knowledge entries.
- No scheduler: nothing runs capture, compaction, or pruning on a timer (the "broader platform scheduling" the card defers).
- No single unified lifecycle schema and no registered JSON Schema for knowledge entries; the lifecycle models above are not reconciled, and the core `candidate -> compacted -> promoted -> retired` model is not the on-disk format.
- Events are not guaranteed complete: admission policy can dedupe, skip, or roll up events under pressure, and capture failures are swallowed.
- No cross-repo transfer is implied; global reusable pattern memory resolves under `PLAYBOOK_HOME` and is governed separately (`docs/CONSUMER_INTEGRATION_CONTRACT.md`).
- Pruning of superseded knowledge discards those entries; the layer keeps no tombstone for them.

## Related
- `docs/contracts/REPOSITORY_MEMORY_KNOWLEDGE_CONTRACT.md`
- `docs/contracts/REPOSITORY_MEMORY_EVENT_CONTRACT.md`
- `docs/architecture/KNOWLEDGE_COMPACTION_PHASE.md`
- `docs/commands/memory.md`
- `docs/commands/knowledge.md`
