# Failure Intelligence Contract

Roadmap card: `PB-V06-FAILURE-TAXONOMY-001`. Builds on the test-failure loop (`test-triage`, `test-fix-plan`, `test-autofix`, `remediation-status`) and reuses its `normalizeAssertionShape` normalizer for signatures.

## Scope

`playbook failure` captures failures from any source (build, CI, lint, test, runtime, verify, manual) as structured intelligence with a stable taxonomy, then maps each category to deterministic prevention suggestions (rule, test, docs, remediation). It is read-only with respect to the repository: it writes only `.playbook/` artifacts and never edits rules, tests, docs or source, and it never runs `apply`. Scaffolds are proposals only.

## Commands

- `playbook failure ingest --input <path> [--out <path>] [--json]` reads failure records, classifies them, and writes `.playbook/failure-taxonomy.json` (or `--out`).
- `playbook failure suggest [--input <path>] [--out <path>] [--json]` reads a taxonomy artifact (default `.playbook/failure-taxonomy.json`) and emits prevention suggestions grouped by category.
- `playbook failure classify [--input <path>] [--json]` accepts a taxonomy artifact (default `.playbook/failure-taxonomy.json`) or raw failure records and writes one closure report per failure to `.playbook/failures/<id>-<sig8>.report.json` (`kind: playbook-failure-report`). A new report is `closure: { status: "codification_required", preventionTargets: [] }`. Re-running keeps an existing `closed` closure when the failure signature is unchanged.
- `playbook failure scaffold [--input <path>] [--failure <id>] [--out <path>] [--json]` writes `.playbook/failure-scaffolds.json` (`kind: playbook-failure-scaffolds`, `proposeOnly: true`): per failure a `rule`, `test` and `doc` scaffold with `targetId`, `proposedPath` (a path in the repo where a human could place it, never written) and skeleton `content`. Unknown `--failure` ids fail.
- `playbook failure check [--json]` is the closure rule (see below); read-only.

## Closure rule

A failure is closed only when its report carries `closure.status: "closed"` and at least one `closure.preventionTargets` id (for example `rule:contract-sync`, `test:cli-contracts`, `doc:COMMAND_CONTRACTS_V1`). `failure check` scans `.playbook/failures/*.json`, ignores any file that is not a `playbook-failure-report` (such as input samples), and exits non-zero while any report is `codification_required`, `closed` without prevention targets, or has an unknown status. Closing is a human edit of the report file; no command closes a failure. With no reports the check passes. `failure check` is not yet wired into `verify`, `doctor` or the CI workflow.

## Input

A JSON object `{ "failures": [...] }`, a bare array, or a single record. Each record requires a non-empty string `message`; optional `id`, `source`, `file`, `evidence[]`. Unknown `source` values become `manual`. Missing ids become `failure-0001` by input order.

## Taxonomy (stable ids)

`build.type-error`, `build.compile-error`, `lint.violation`, `test.assertion`, `test.snapshot-mismatch`, `test.timeout`, `dependency.resolution`, `contract.schema-drift`, `config.invalid`, `filesystem.permission`, `network.unreachable`, `runtime.exception`, `unknown`.

The ids are a closed set mirrored in `docs/contracts/FAILURE_TAXONOMY_SCHEMA.json`; adding or renaming one is a contract change (schema, snapshot and changelog together).

## Determinism

- Classification is a first-match-wins ordered rule list over `message` plus `evidence`; no network, clock, locale or filesystem dependence.
- Signature: `failtax-` + first 16 hex of sha256 over `{category, file, normalized message shape}`.
- All lists sort by code-unit order (failures by `id` then `signature`, categories and suggestions by category id).
- Unmatched input is `unknown` with `matchedRule: "no-match"`; it is never guessed.

## Non-goals

No automatic rule/test/doc generation (scaffolds are written only as `.playbook/` proposals), no promotion of patterns or knowledge, no mutation outside `.playbook/` artifacts. Suggestions are advisory text for a human or for `plan`.
