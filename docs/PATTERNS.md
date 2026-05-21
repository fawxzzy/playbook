# Playbook Patterns

This document captures repo-level product and experience patterns that should govern future Playbook work.

Rule: Promote repeated pilot learnings into explicit doctrine before they become tribal knowledge.

## Natural-language pattern capture

Product work often arrives through loose natural-language references rather than canonical component names. Playbook should treat those references as real pattern-discovery inputs.

- **Rule**: When a user says to reuse something from another page, component, or flow, treat it as a possible reusable pattern.
- **Pattern**: Alias-Aware References.
- **Definition**: The same component, flow, or pattern may be described through multiple names, screenshots, or behavioral cues rather than one canonical identifier.
- **Design implication**: Resolve references by context, file usage, UI role, and nearby examples, not only by exact naming.

- **Pattern**: Abstract -> Document -> Reuse.
- **Definition**: When the same UI, UX, or code behavior appears in multiple places, the preferred path is shared abstraction first, documentation second, repeated reuse third.
- **Design implication**: Reuse the existing shared component or route work through a new shared abstraction instead of silently duplicating behavior.

- **Failure Mode**: Silent Pattern Forking.
- **Definition**: A new component or flow is created that looks almost the same as an existing one but carries slightly different behavior without an explicit reason.
- **Why it matters**: Silent forks create drift, increase future integration cost, and make larger feature lanes harder to land cleanly.

Rule: When a durable shared pattern emerges, update the canonical pattern notes rather than leaving it as task-local memory only.

Rule: AI workers may suggest consolidation automatically, but they should avoid destructive refactors unless the task explicitly asks for them or the consolidation is small, obvious, and well-tested.

## Provenance-Bounded Derivative Packs

Historical or quarantined source material can still produce reusable doctrine, but only through reviewed derivative pattern packs.

- **Pattern**: Visible-Untrusted -> Reviewed Derivative Pattern Pack.
- **Definition**: Historical source with explicit untrusted posture may seed reusable pattern doctrine only after reviewed derivative notes isolate the portable principle from the raw source.
- **Design implication**: Use the derivative pack as the canonical intake and review surface before any runtime, operator, or app seam is considered.
- **Canonical intake surface**: `docs/contracts/VERTA_DERIVATIVE_PATTERN_PACK.md`
- **Promotion receipt**: `docs/contracts/VERTA_DERIVATIVE_PATTERN_PROMOTION_RECEIPT.md`
- **Read-only lookup surface**: `pnpm playbook patterns verta --json`
- **Planning-gate validator**: `pnpm playbook patterns verta gate --file <candidate-record.json> --json`

Promoted Verta-derived entries:

- `verta.pattern.deterministic-first-reuse.v1`: Promote deterministic review and reuse discipline before interpretive or runtime widening.
- `verta.pattern.bounded-convergence-through-seams.v1`: Prefer explicit seams and owner boundaries over broad filesystem absorption.
- `verta.pattern.provenance-before-reuse.v1`: Reuse only rewritten derivatives with explicit provenance and reviewable trust posture.
- `verta.pattern.owner-repo-truth-boundary.v1`: Keep executable truth in the owner repo; keep derivative packs and root projection non-executable.
- `verta.pattern.tranche-based-promotion.v1`: Promote reviewed doctrine by tranche instead of collapsing the whole pack into one trust decision.
- `verta.pattern.review-before-widening.v1`: Keep doctrine review ahead of adapters, parity, or runtime widening.
- `verta.pattern.single-owner-seam-first.v1`: Name one owner seam before routing derivative behavior elsewhere.
- `verta.pattern.execution-deferred-without-owner.v1`: Leave execution-adjacent ideas pending until a separate executable owner seam exists.
- `verta.pattern.reusable-governance-heuristics.v1`: Promote governance heuristics only after they are rewritten as explicit derivative doctrine with evidence.
- `verta.pattern.workflow-interpretation-follows-governed-truth.v1`: Keep interpretation doctrine downstream of deterministic governed truth and out of execution lanes.

Failure Mode: Treating historical source presence as permission to promote raw text, source trees, or executable guidance into canonical pattern memory.

## Stack Sustain Patterns

Recent ATLAS-root governance work reinforced a few reusable sustain patterns that Playbook should keep explicit.

- **Pattern**: Archive Governance Becomes Real Only After Merge, Repin, and Full Validation.
- **Definition**: Enforcement work is not complete when a branch passes targeted tests; it becomes durable only after the merged default branch is repinned and the full validator is green.
- **Design implication**: Treat post-merge lock refresh and full-validator closeout as part of the governance change, not as optional cleanup.

- **Pattern**: Atomic Topology Admission.
- **Definition**: A repo is either admitted or deferred across every root truth surface; mixed posture is a governance defect.
- **Design implication**: Manifest, lock, inventory, README, and owner-usage surfaces should move together as one bounded admission package.

- **Pattern**: Release-Safety Waves Before Runtime Expansion.
- **Definition**: Harden replay evidence, destructive guardrails, receipt health, and rollback confidence in small merged waves before widening execution authority.
- **Design implication**: Prefer narrow operator-safety tranches with deterministic verification over broad runtime feature pushes.

- **Pattern**: Clean Worktree Lane Execution.
- **Definition**: Governance and release-safety lanes should run in clean worktrees when the main checkout carries unrelated local drift.
- **Design implication**: Keep dirty local state untouched, isolate the tranche, and validate the exact branch or post-merge `main` state you intend to claim.

## System -> Interpretation Gap

A deterministic system can be correct and still be hard to use when its outputs require too much internal system knowledge to interpret.

- **Pattern**: System -> Interpretation Gap.
- **Definition**: The gap between governed system truth and the human ability to understand what matters next.
- **Why it matters**: The external fitness pilot showed that correct outputs alone do not guarantee actionability or adoption.
- **Design implication**: Treat interpretation as a first-class product layer, not as optional polish.

Failure Mode: Correct-but-dense outputs that require system knowledge reduce actionability and adoption.

## Interpretation Layer

Playbook should provide a representational layer that converts deterministic system truth into human-readable guidance.

- **Pattern**: Interpretation Layer.
- **Job**: Derive summaries, priorities, and explanations from governed artifacts.
- **Non-goal**: This layer must not mutate source-of-truth artifacts or introduce hidden system state.
- **Output shape**: concise summaries, next-step framing, confidence/exceptions, and links back to canonical artifacts.

Rule: Interpretation must be derived from deterministic system truth rather than replacing it.

## Progressive Disclosure

Operators should be able to start with the smallest useful answer and reveal deeper system detail only when needed.

- **Pattern**: Progressive Disclosure.
- Start with a short answer, health summary, or decision recommendation.
- Reveal evidence, related artifacts, and lower-level diagnostics on demand.
- Keep dense system truth accessible, but do not force it into the default view.

Pattern: Human-facing outputs should widen from summary -> explanation -> artifact detail.

## Single Next Action

When Playbook knows the most useful next operator move, it should say so clearly.

- **Pattern**: Single Next Action.
- Prefer one recommended action over a flat list of equally weighted possibilities.
- Use alternatives only when the primary action is blocked or depends on human review.
- Pair the action with a short reason and the governing evidence.

Rule: Default operator guidance should converge on one recommended next step whenever evidence is sufficient.

## State -> Narrative Compression

Playbook often has more state than a human needs to read. Product surfaces should compress state into a narrative that preserves truth while lowering cognitive load.

- **Pattern**: State -> Narrative Compression.
- Compress deterministic state into a short explanation of what happened, why it matters, and what comes next.
- Keep provenance intact by linking every narrative back to its underlying artifacts.
- Prefer stable summaries over ad hoc prose.

Pattern: Deterministic state should be compressible into deterministic narrative.

## Pilot-derived engineering patterns

The first external pilot also exposed concrete product-engineering patterns that should govern future system work.

### Discord verification gates

- **Pattern**: App-session proof -> signed Discord interaction -> one-time token consume -> role grant.
- **Definition**: When Discord access or display state depends on another application, the source app remains the identity authority and Discord only consumes short-lived proof or source-app-owned display state minted from an authenticated app session.
- **Design implication**: Prefer a source-app-hosted signed HTTP interactions endpoint over email-only checks, persisted verification state, or local-only Gateway bot production flows.
- **Extension**: If Discord should show app-owned member numbers, persist a durable Discord/source-app link and treat nickname sync as display state, not identity proof.
- **Extension**: If Discord should collect bug reports, use a persistent panel plus buttons and modals, keep attachments bounded and externally hosted, and route reviewed output through governed queues rather than writing directly into repo truth.
- **Extension**: If Discord should publish release notes, use production deployment events only as draft inputs, then publish curated `@everyone` community posts instead of raw technical logs.
- **Reference**: [Discord verification gates](./PATTERNS/discord-verification-gates.md)

### Shared aggregation boundary for reads, targeted invalidation boundary for writes

- **Pattern**: Shared aggregation boundary for reads, targeted invalidation boundary for writes.
- Read models should compose through one shared aggregation boundary so interpretation and diagnostics read the same truth.
- Write paths should invalidate only the affected recomputation boundaries rather than rebuilding unrelated state.
- This keeps correctness and operator trust aligned while reducing unnecessary churn.

Rule: Read composition should converge through shared aggregation, while writes should invalidate only the affected canonical boundaries.

### Mutation path -> affected canonical IDs -> centralized recompute

- **Pattern**: Mutation path -> affected canonical IDs -> centralized recompute.
- Mutations should first identify which canonical IDs changed.
- Recompute should then run through one centralized path rather than scattered local refresh logic.
- This keeps repeated logic, correctness seams, and invalidation behavior auditable.

Rule: Mutation handling should flow through canonical IDs and centralized recompute rather than distributed bespoke refresh logic.

## Pilot doctrine capture

The external fitness pilot promoted the following doctrine into repository-level guidance:

- stabilize tooling surface before governed product work
- first governed improvements should target correctness/performance seams with repeated logic and clear invariants
- tooling migration incomplete until runtime + governance bootstrap proof passes
- migration ledger repair should require schema evidence before history is marked applied

Failure Mode: A repo can look integrated while still failing real governed consumption due to missing bootstrap/runtime/artifact guarantees.

## Cognitive Dynamics Framework v0.1 (research link)

This repo also maintains a doctrine-level cognitive model in [Cognitive Dynamics Framework v0.1](./research/COGNITIVE_DYNAMICS_FRAMEWORK_V0_1.md).

Operator surface: use `pnpm playbook patterns csia --json` for the machine-readable, read-only CSIA overlay view.

### When to use this framework

Use it when reviewing interpretation drift, pattern/rule transferability, or recalibration needs across changing repository evidence.

Non-goal: it does not replace command truth or the canonical remediation flow.

