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

## Repository profile (product vs consumer)

Doctor, `docs audit` and `audit architecture` classify the repository before choosing checks:

1. `playbook.config.json` field `"repoType": "product" | "consumer"` wins when present.
2. Otherwise the Playbook product layout (root `package.json` name `playbook-monorepo`, `packages/cli/package.json` named `@fawxzzy/playbook` or `@zachariahredfield/playbook`, or a generated `docs/contracts/command-truth.json` that carries the command list) means `product`.
3. Otherwise Playbook adoption evidence (`playbook.config.json`, `.playbookignore`, `.playbook/`, `scripts/playbook-runtime.mjs`, `docs/PLAYBOOK_NOTES.md`) means `consumer`.
4. Anything else, including an invalid `playbook.config.json` or an unknown `repoType` value, fails closed to `product`.

Product-only checks apply only to `product`: the product docs anchors, the `docs/contracts/command-truth.json` requirement, the repo-roadmap/story contract, the single-roadmap duplicate check, and the architecture-audit hardening docs (AI determinism boundary, artifact evolution, adapters, context efficiency, remediation trust model, SCM context layer, roadmap coverage). Repo-agnostic checks (`README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md` anchors, command-truth ladder drift when a repo keeps its own command-truth file, archive hygiene, artifact hygiene, verify) run for every repo. For a consumer, doctor adds an info finding `doctor.docs.repo-profile.consumer` that states why the profile was chosen. `playbook verify` is not affected.

## Behavior

- Surfaces findings grouped across architecture, docs, testing, risk, and memory categories.
- Integrates architecture-audit checks into health reporting.
- Reports structured `artifactHygiene` and `memoryDiagnostics` payloads in JSON mode.
- Returns stable machine-readable contracts for automation via `--json`.
- Returns exit `1` when the structured report status is `error`; `ok` and `warning` reports return exit `0`.
- Treat exit `1` as a diagnostic failure only after validating the `--json` envelope, summary, findings, and failure domains; do not treat the exit code alone as proof of a successful Doctor run.
