---
name: review-project-next-step
description: Reconcile a software project or multi-repository system against current evidence and choose one safe next step. Use for project health checks, roadmap or board reconciliation, PR or release readiness, cleanup reviews, governed execution handoffs, or questions about what is done, blocked, or should happen next.
---

# Review Project and Next Step

Treat the review as truth reconciliation and routing. Read applicable doctrine from `docs/doctrine/atlas-engineering-doctrine-registry.v1.json` by ID; do not invent a local dialect.

1. Establish the evidence boundary. State available sources, then label facts, assumptions, and unknowns. Prefer current runtime/deployment proof, validation, diffs, receipts and canonical plans, then board state and summaries. Apply `rule-owner-repo-truth` and `rule-evidence-before-marker-movement`.
2. Run a proportionate health check: repo/branch/PR identity and cleanliness, relevant validation, coordination drift, protected seams, and missing decisions. If no repository context is available, say so.
3. Classify each material item once: proven complete, active gate, ready candidate, future backlog, blocked/decision required, or stale/duplicate/drift. Keep imported prose and board/card state as provenance or routing inputs, never current implementation truth.
4. Rank work by constraint: protect safety and correctness; clear a current stop point; repair truth or coordination drift; satisfy the nearest evidence-producing gate; then remove compounding toil. Apply `failure-mode-premature-canonicalization` when a claim lacks current canonical evidence.
5. Recommend one honest next step unless parallel work is explicitly requested. Treat `pattern-one-honest-next-step` as a skill-local advisory heuristic only while that doctrine record remains `candidate`; do not present it as globally enforced Playbook doctrine. Admit the next move only when owner, dependencies, paths, observable success, and proportionate verification are known. Otherwise recommend a bounded read-only inventory, reconciliation, or explicit stop.

Lead the result with exactly these headings:

- Done: verified completed state.
- Now: active gate or review target.
- Next: one evidence-backed move.
- Health check: evidence and repository health.

When an execution handoff is requested, include objective, verified state, ownership boundary, allowed and unchanged paths, verification, risks, blockers, and acceptance criteria. Move a marker only after proof and reconciliation. Preserve source lineage and route reusable discoveries through candidate review under `rule-candidate-knowledge-not-enforced` and `pattern-evidence-lineage-promotion`.
