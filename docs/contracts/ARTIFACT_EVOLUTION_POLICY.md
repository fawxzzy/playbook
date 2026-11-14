# Artifact Evolution Policy

This policy defines compatibility and regeneration rules for persisted Playbook artifacts.

## Why this policy exists

Playbook’s long-term reliability depends on deterministic repository artifacts powering higher-level intelligence commands.

All persisted artifacts must include schema versioning and an explicit evolution policy.

## Contract scope

This policy applies to persisted artifacts produced or consumed by Playbook command workflows, including:

- `.playbook/repo-index.json`
- `.playbook/repo-graph.json`
- `.playbook/verify.json` and `verify --json` envelopes
- `.playbook/plan.json` and `plan --json` envelopes
- deterministic analyze-pr/risk outputs emitted via CLI JSON contracts
- demo and snapshot contract fixtures used for test/contract stability

## Required contract fields

All persisted artifacts must include:

- `schemaVersion`: explicit compatibility contract marker
- `command` or `kind`: producer identity and artifact classification
- deterministic ordering for list-like fields where ordering is part of the contract

## Compatibility model

Playbook uses semantic version intent for artifact schemas:

- **patch** (`1.0` -> `1.0.x` docs/tests only): clarifications with no payload shape change
- **minor** (`1.0` -> `1.1`): additive, backward-compatible fields or enum values
- **major** (`1.x` -> `2.0`): breaking change to required fields, semantics, or identifiers

### Non-breaking (allowed)

- adding optional fields
- adding additive node/edge kinds where consumers are instructed to tolerate unknown kinds
- adding deterministic summary sections that do not change existing required fields

### Breaking (requires major bump)

- removing or renaming required fields
- changing semantic meaning of existing fields
- changing ID conventions relied on by downstream consumers
- changing deterministic ordering assumptions without migration guidance

## Locale-independent ordering for hashed values

Any sort whose result feeds a hash, digest, fingerprint or checksum must order strings by UTF-16 code unit (`compareCodeUnits` in `packages/engine/src/util/compareCodeUnits.ts`), not with `localeCompare`. `localeCompare` depends on the process locale and the ICU build, so the same input can hash differently on two machines. `localeCompare` stays correct for text shown to people.

Enforced today for the values Playbook recomputes and compares, each of which also accepts the value an older version produced with locale-collation key order so nothing already stored or pinned breaks: the plan digest and change-scope bundle, the artifact envelope checksum, the Fitness contract fingerprint (`expectedFingerprint`), the launch-plan fingerprint in orchestration run state, and the Atlas knowledge-candidate admission digests. Promotion receipt ids use the same ordering; they are stored and never recomputed, so there is no older value to accept.

Open item `ART-DET-001` (not enforced, deliberately): the key-sorting canonicalizers that feed persisted identifiers still use `localeCompare`: `packages/core/src/knowledge/knowledge-id.ts`, `packages/core/src/contracts/memory.ts`, `packages/engine/src/memory/admission.ts`, `packages/engine/src/memory/events.ts`, `packages/engine/src/memory/index.ts`, `packages/engine/src/extract/patternCandidates.ts`, `packages/engine/src/runtimeCompiler/runtimeCompiler.ts` and `packages/engine/src/orchestration/workerResults.ts`. Switching them changes ids that are already stored in consumer `.playbook` artifacts whenever sibling keys collate differently (a real pair exists: `scoreVersion` and `scoredAt` in the salience envelope), which is an identifier-convention change under the compatibility model above. It needs a versioned migration (or a dual-read period per artifact family) and is not a drop-in fix.

## Regeneration and freshness expectations

- `pnpm playbook index` is the canonical producer for `.playbook/repo-index.json` and `.playbook/repo-graph.json`.
- Repository intelligence consumers (`query`, `deps`, `ask --repo-context`, `explain`, `analyze-pr`) must treat index artifacts as authoritative and fail with deterministic guidance when missing.
- Freshness detection should surface deterministic warnings when artifacts appear stale relative to current repository state (for example via `pnpm playbook doctor`).
- CI pipelines should regenerate required runtime artifacts before artifact-consuming analysis steps.

## CI mismatch behavior

When artifact schema versions mismatch command expectations:

1. Command must fail deterministically with an explicit schema mismatch error.
2. Output should include actionable remediation (`re-run pnpm playbook index`, regenerate plan, or rerun producing command).
3. CI should treat mismatch as a contract failure, not a soft warning.

## Governance rule

Documentation synchronization is a required part of Playbook governance.

When artifact contracts evolve, update in the same PR:

- command docs (`docs/commands/*`)
- contract docs (`docs/contracts/*`)
- roadmap/changelog surfaces (`docs/PLAYBOOK_PRODUCT_ROADMAP.md`, `docs/CHANGELOG.md`)
- tests/snapshots/schemas guarding the affected command output
