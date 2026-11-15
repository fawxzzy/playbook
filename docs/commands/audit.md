# `pnpm playbook audit architecture`

Run deterministic architecture guardrail checks.

## Usage

```bash
pnpm playbook audit architecture
pnpm playbook audit architecture --json
```

## Behavior

- `architecture` is the supported audit subcommand.
- For consumer repositories (see the repository profile section in `docs/commands/doctor.md`) the Playbook-product hardening checks (AI determinism boundary, artifact evolution, adapters, context efficiency, remediation trust model, SCM context layer, roadmap coverage) are skipped; unknown or ambiguous repos keep every check.
- Runs ordered guardrail checks from the core architecture audit.
- Returns non-zero only when failing checks are present.
- Text mode shows summary, actionable findings (`warn`/`fail`), passing checks, and next actions.

## JSON output envelope

`--json` emits a stable payload with:

- `schemaVersion`
- `command` (`audit-architecture`)
- `ok`
- `summary` (`status`, `checks`, `pass`, `warn`, `fail`)
- `audits[]` (`id`, `title`, `status`, `severity`, `evidence[]`, `recommendation`)
- `nextActions[]`
