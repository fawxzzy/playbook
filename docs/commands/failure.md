# `pnpm playbook failure`

Classify failures from any source into a stable taxonomy and map them to deterministic prevention suggestions.

## Usage

```bash
pnpm playbook failure ingest --input .playbook/failures/sample.json --json
pnpm playbook failure suggest --json
pnpm playbook failure suggest --input .playbook/failure-taxonomy.json --out .playbook/failure-suggestions.json
```

## What it does

- `ingest` reads a JSON file (`{ "failures": [{ "message": "...", "source": "test", "file": "...", "evidence": [] }] }`, a bare array, or one record), classifies each record, and writes `.playbook/failure-taxonomy.json` (or `--out`).
- `suggest` reads that artifact and emits per-category prevention suggestions (rule, test, docs, remediation).

Output is deterministic (ordered rules, code-unit sorting, no network or clock). It writes only `.playbook/` artifacts and does not run `apply` or edit rules, tests or docs.

See [`docs/contracts/FAILURE_INTELLIGENCE_CONTRACT.md`](../contracts/FAILURE_INTELLIGENCE_CONTRACT.md) and [`docs/contracts/FAILURE_TAXONOMY_SCHEMA.json`](../contracts/FAILURE_TAXONOMY_SCHEMA.json). Related: [`test-triage`](test-triage.md), [`remediation-status`](remediation-status.md).
