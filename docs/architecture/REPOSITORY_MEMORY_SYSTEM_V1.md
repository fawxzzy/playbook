# Repository Memory System v1 (Canonical Specification)

- feature_id: PB-V08-MEMORY-SYSTEM-001
- status: canonical specification; roadmap card `PB-V08-MEMORY-SYSTEM-001` is `implemented-hardening` in `docs/roadmap/ROADMAP.json` (runtime surfaces exist), so this text is no longer purely future-state. Live command truth is `docs/commands/README.md`

## Purpose

Define the canonical memory model for Playbook-enabled repositories so temporal engineering memory is captured, promoted, and reused without weakening deterministic governance.

This specification establishes:

- the four memory layers,
- the canonical `.playbook/` artifact layout,
- the promotion boundary from ephemeral context to reviewed durable knowledge,
- provenance requirements,
- privacy/local-first constraints,
- and explicit non-goals.

## Canonical memory layers

### 1) Working memory

Working memory is ephemeral execution context used during an active task/session.

- Scope: current run, short-lived local context, in-flight scaffolding.
- Characteristics: overwriteable, pruneable, non-authoritative.
- Primary use: help agents/tools complete current workflows, not define durable truth.

### 2) Episodic memory

Episodic memory is time-ordered engineering history.

- Scope: events and outcomes across runs (verify/plan/apply cycles, decisions, command invocations).
- Characteristics: append-oriented, timestamped, actor/process attributed.
- Primary use: replay, audit trails, and source evidence for future promotion.

### 3) Semantic memory

Semantic memory is reviewed durable repository knowledge distilled from episodes.

- Scope: reusable insights, validated mappings, stable repository facts.
- Characteristics: versioned, provenance-backed, promotion-gated.
- Primary use: cross-session reuse with explicit evidence and review lineage.

### 4) Doctrine / procedural memory

Doctrine/procedural memory is normative guidance that governs behavior.

- Scope: rules, contracts, operating doctrine, approved procedures.
- Characteristics: PR-reviewed, version-controlled, policy-authoritative.
- Primary use: define what is allowed, required, and canonical for repository operation.

## Canonical artifact layout under `.playbook/`

### Structural runtime artifacts (remain structural, not temporal memory)

The following artifacts remain structural runtime intelligence artifacts:

- `.playbook/repo-index.json`
- `.playbook/repo-graph.json`

These files represent repository shape/intelligence used by command surfaces (`index/query/graph/ask/explain`) and are **not** temporal engineering memory stores.

### Temporal engineering memory root

All temporal engineering memory lives under:

- `.playbook/memory/*`

Canonical sub-layout:

- Working memory: `.playbook/memory/working/*`
- Episodic memory: `.playbook/memory/episodic/*`
- Semantic memory: `.playbook/memory/semantic/*`
- Doctrine/procedural memory derivatives or mirrors (optional, non-authoritative): `.playbook/memory/doctrine/*`

Normative doctrine still lives in governed repository surfaces (for example `AGENTS.md`, docs, rules, and contracts) even if derived mirrors exist under `.playbook/memory/doctrine/*`.

## Promotion boundary: ephemeral context -> reviewed durable knowledge

Promotion from ephemeral memory (working + episodic) into durable reusable knowledge (semantic and/or doctrine-level adoption) MUST cross an explicit review boundary.

Promotion gates (minimum):

1. **Evidence gate**: candidate references concrete episodic evidence.
2. **Repeatability gate**: signal appears across multiple episodes or contexts.
3. **Review gate**: explicit reviewer/policy approval is recorded.
4. **Versioning gate**: promoted artifact receives stable ID/version and rationale.
5. **Traceability gate**: provenance links allow backward traversal from claim -> source evidence.

Until all gates pass, artifacts remain candidates and MUST NOT be treated as normative policy.

## Provenance requirements

Durable memory artifacts MUST carry provenance sufficient for deterministic audit/replay.

Minimum provenance fields:

- Artifact ID and version.
- Created-at and updated-at timestamps.
- Author/actor/process identity.
- Source evidence references (event IDs, file paths, commit SHAs, command outputs).
- Promotion rationale.
- Review decision metadata (reviewer/policy, timestamp, decision outcome).

## Repository Memory Events (v1 event store)

Merged from the former `REPOSITORY_MEMORY_EVENTS.md`. Repository Memory Events are deterministic, append-only operational evidence for core orchestration workflows.

- Rule: record events, not interpretations. Conflating raw events with derived insights corrupts evidence lineage.
- Pattern: append-only event stores preserve deterministic system history.
- Locations: `.playbook/memory/events/` (append-only event files) and `.playbook/memory/index.json` (event counts and latest timestamps by `event_type`).
- Event types (v1): `route_decision`, `lane_transition`, `worker_assignment`, `lane_outcome`, `improvement_candidate`. Every record also carries `schemaVersion` and `event_id`.
- Determinism: stable JSON formatting (2-space indent, trailing newline), canonical key ordering, event ids derived from timestamp + event type + canonical payload hash with deterministic collision suffixing, monotonic append-safe index updates.
- Engine helpers: `recordRouteDecision()`, `recordLaneTransition()`, `recordWorkerAssignment()`, `recordLaneOutcome()`, `recordImprovementCandidate()`; wrap calls in `safeRecordRepositoryEvent()` where recording must stay best-effort and non-blocking.
- The envelope schema for memory events is in [REPOSITORY_MEMORY_EVENT_CONTRACT.md](../contracts/REPOSITORY_MEMORY_EVENT_CONTRACT.md).

## Canonical memory-system and replay/promotion artifacts

Merged from the former `PLAYBOOK_REPOSITORY_MEMORY_SYSTEM.md`. Two canonical read-only artifacts unify the layers above: `.playbook/memory-system.json` and `.playbook/replay-promotion-system.json`. The contract is v1 and does not widen mutation authority.

- `.playbook/memory-system.json`: current memory inventory by class, replay/consolidation/promotion boundary refs, pressure/retention class summary, and stale/superseded/candidate state summaries.
- `.playbook/replay-promotion-system.json`: replay and consolidation candidate inventories, compaction review buckets, salience and review-required status, promotion-ready vs candidate-only boundaries, lifecycle summaries (candidate, promoted, stale, superseded, retired) and provenance refs across replay -> consolidation -> compaction -> promotion. Built from canonical source artifacts only.
- Layer sources: structural graph (`.playbook/repo-index.json`, `.playbook/repo-graph.json`); temporal memory (`.playbook/memory/index.json`, `.playbook/memory/events/*`); candidate knowledge (`.playbook/memory/replay-candidates.json`, `candidates.json`, `lifecycle-candidates.json`); promoted doctrine (`.playbook/memory/knowledge/{decisions,patterns,failure-modes,invariants}.json`).
- Boundaries: graph and temporal artifacts stay separate; episodic evidence never auto-promotes into doctrine; replay, consolidation, compaction and promotion remain explicit, provenance-preserving, review-required layers.
- Authority: mutation `read-only`, promotion `review-required`, execution `unchanged`.
- Pattern: observe -> replay -> consolidate -> compact -> review -> promote. Failure mode: without a canonical replay/promotion contract, adjacent memory artifacts drift into overlapping authority.

## Privacy and local-first stance

Repository memory is local-first by default.

- Memory artifacts are stored inside repository-controlled `.playbook/*` surfaces unless explicitly exported by user/operator intent.
- No cloud/remote synchronization is implied by this specification.
- Teams should treat memory content as potentially sensitive engineering context and apply least-privilege access, redaction, and retention controls.

## Explicit non-goals

Repository Memory System v1 (feature_id: PB-V08-MEMORY-SYSTEM-001) does **not**:

- Mandate a specific storage backend (database, queue, or external service).
- Replace deterministic command outputs with opaque memory retrieval.
- Allow unreviewed ephemeral context to become doctrine.
- Reclassify `.playbook/repo-index.json` or `.playbook/repo-graph.json` as temporal memory.
- Define hosted multi-tenant memory operations.

## Playbook Notes candidates

- **Pattern: Fast Episodic Store, Slow Doctrine Store**
  - Episodic capture should optimize for append speed and auditability.
  - Doctrine promotion should optimize for review quality, stability, and policy safety.

- **Rule: Working Memory Is Not Doctrine**
  - Working-memory artifacts are never policy-authoritative.
  - Promotion and review are mandatory before doctrine adoption.

- **Rule: Retrieval Must Return Provenance**
  - Any retrieval surface that returns memory-backed claims must include evidence references and lineage metadata.
  - Claims without provenance are treated as non-authoritative.

- **Failure Mode: Memory Hoarding**
  - Storing large volumes of uncurated episodic/working artifacts without promotion, pruning, or retention controls degrades retrieval quality and increases risk.
  - Mitigate via retention windows, compaction, and explicit promotion workflows.
