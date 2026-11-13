# `pnpm playbook analyze`

## What it does
Analyzes the current repository and reports stack/governance recommendations.

`analyze` is a compatibility-friendly and lightweight signal command. For the canonical serious-user flow, start with `ai-context`/`ai-contract`/`context`, then `index` + repository intelligence commands, followed by `verify -> plan -> apply -> verify`.

## Common usage
- `pnpm playbook analyze`
- `pnpm playbook analyze --ci`
- `pnpm playbook analyze --json`
- `pnpm playbook analyze --explain`

## Notable flags
- `--ci`: CI-friendly output.
- `--json` / `--format json`: machine-readable output.
- `--quiet`: suppress success output in text mode.
- `--explain`: include rationale and remediation context.

## Plugin detectors
- Detectors from plugins listed in `playbook.config.json` `plugins` run after the built-in dependency detectors and appear in `detected` and `detectorsRun` (see `docs/contracts/PLUGIN_CONTRACT_V1.md`). Repositories without plugins produce the same report as before.
