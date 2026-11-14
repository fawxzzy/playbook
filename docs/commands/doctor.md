# `pnpm playbook doctor`

Diagnose repository health by aggregating verify, risk, docs, architecture-audit, artifact-hygiene, and memory diagnostics.

## Usage

```bash
pnpm playbook doctor
pnpm playbook doctor --json
pnpm playbook doctor --quiet
```

## Options

- `--ai`: listed in `--help` as including AI-readiness diagnostics; the flag is parsed but not yet consumed, so the output is currently unchanged.
- `--fix`: listed in `--help` as enabling deterministic doctor fix planning/apply mode; currently accepted but ignored (the fix registry in `packages/cli/src/lib/doctorFixes.ts` is not wired into the command), so no files are written.
- `--dry-run`: listed in `--help` for previewing doctor fixes; currently ignored together with `--fix`.
- `--yes`: listed in `--help` for applying eligible doctor fixes without confirmation; currently ignored together with `--fix`.
- `--json` / `--format json`: machine-readable output.
- `--quiet`: suppress success output in text mode.

## Behavior

- Surfaces findings grouped across architecture, docs, testing, risk, and memory categories.
- Integrates architecture-audit checks into health reporting.
- Reports structured `artifactHygiene` and `memoryDiagnostics` payloads in JSON mode.
- Returns stable machine-readable contracts for automation via `--json`.
- Returns exit `1` when the structured report status is `error`; `ok` and `warning` reports return exit `0`.
- Treat exit `1` as a diagnostic failure only after validating the `--json` envelope, summary, findings, and failure domains; do not treat the exit code alone as proof of a successful Doctor run.
