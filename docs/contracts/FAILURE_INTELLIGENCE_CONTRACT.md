# Failure Intelligence Contract

Roadmap card: `PB-V06-FAILURE-TAXONOMY-001`. Builds on the test-failure loop (`test-triage`, `test-fix-plan`, `test-autofix`, `remediation-status`) and reuses its `normalizeAssertionShape` normalizer for signatures.

## Scope

`playbook failure` captures failures from any source (build, CI, lint, test, runtime, verify, manual) as structured intelligence with a stable taxonomy, then maps each category to deterministic prevention suggestions (rule, test, docs, remediation). It is read-only with respect to the repository: it writes only `.playbook/` artifacts and never edits rules, tests, docs or source, and it never runs `apply`.

## Commands

- `playbook failure ingest --input <path> [--out <path>] [--json]` reads failure records, classifies them, and writes `.playbook/failure-taxonomy.json` (or `--out`).
- `playbook failure suggest [--input <path>] [--out <path>] [--json]` reads a taxonomy artifact (default `.playbook/failure-taxonomy.json`) and emits prevention suggestions grouped by category.

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

No automatic rule/test/doc generation, no promotion of patterns or knowledge, no mutation outside `.playbook/` artifacts. Suggestions are advisory text for a human or for `plan`.
