# `pnpm playbook failure`

Classify failures from any source into a stable taxonomy and map them to deterministic prevention suggestions.

## Usage

```bash
pnpm playbook failure ingest --input .playbook/failures/sample.json --json
pnpm playbook failure suggest --json
pnpm playbook failure suggest --input .playbook/failure-taxonomy.json --out .playbook/failure-suggestions.json
pnpm playbook failure classify --json
pnpm playbook failure scaffold --failure failure-0001 --json
pnpm playbook failure check --json
```

## What it does

- `ingest` reads a JSON file (`{ "failures": [{ "message": "...", "source": "test", "file": "...", "evidence": [] }] }`, a bare array, or one record), classifies each record, and writes `.playbook/failure-taxonomy.json` (or `--out`).
- `suggest` reads that artifact and emits per-category prevention suggestions (rule, test, docs, remediation).
- `classify` accepts that artifact or raw failure records and writes one closure report per failure to `.playbook/failures/<id>-<sig8>.report.json`, starting as `codification_required`. Re-running keeps a human `closed` closure when the signature is unchanged.
- `scaffold` writes `.playbook/failure-scaffolds.json`: propose-only rule, test and doc scaffolds (target id, proposed path, skeleton content) per failure; nothing is written outside `.playbook/`. `--failure <id>` narrows it to one failure.
- `check` is the closure rule: exit 1 while any report is `codification_required`, or `closed` without `preventionTargets`. Closing a failure is a human edit of the report. It is not yet wired into `verify`, `doctor` or CI.

Output is deterministic (ordered rules, code-unit sorting, no network or clock). It writes only `.playbook/` artifacts and does not run `apply` or edit rules, tests or docs.

See [`docs/contracts/FAILURE_INTELLIGENCE_CONTRACT.md`](../contracts/FAILURE_INTELLIGENCE_CONTRACT.md) and [`docs/contracts/FAILURE_TAXONOMY_SCHEMA.json`](../contracts/FAILURE_TAXONOMY_SCHEMA.json). Related: [`test-triage`](test-triage.md), [`remediation-status`](remediation-status.md).
