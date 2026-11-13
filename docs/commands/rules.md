# `pnpm playbook rules`

## What it does
Lists loaded verify/analyze rules so contributors and agents can inspect active governance surfaces.

## Common usage
- `pnpm playbook rules`
- `pnpm playbook rules --json`
- `pnpm playbook rules --json --explain`

## Contract notes
- JSON output exposes structured rule lists for `verify` and `analyze`.
- Use this command to validate which rules are currently registered.
- `verify[]` entries carry an additive `source` field (`core`, `plugin`, `legacy-plugin`) and include engine core rules and plugin rules (see `docs/contracts/PLUGIN_CONTRACT_V1.md`).
- Deprecation notices for legacy `playbook-plugin-*` plugins are written to stderr, never into `--json` stdout.
