# `pnpm playbook fix`

## What it does
Applies safe, deterministic autofixes for eligible verify findings.

## Common usage
- `pnpm playbook fix --dry-run`
- `pnpm playbook fix --yes`
- `pnpm playbook fix --json --yes`
- `pnpm playbook fix --only notes.missing --yes`

## Notable flags
- `--dry-run`: preview changes without writing files.
- `--yes`: apply changes without interactive confirmation.
- `--only <ruleId[,ruleId...]>`: apply fixes only for the listed finding/rule IDs (comma-separated).
- `--json` / `--format json`: machine-readable output.
- `--ci`: non-interactive mode; applies without `--yes` and suppresses success output.
- `--explain`: in text mode, also list the files each applied fix touched.

## Behavior
- Without `--dry-run`, `--yes`, or `--ci`, `fix` does not prompt: it skips every eligible task, reports `Interactive prompts are not available; re-run with --yes to apply fixes.`, and exits `1`.
- `--dry-run` exits `0`. An applying run re-verifies afterwards and exits `0` when verify is clean, or `3` (policy failure) when verify still reports failures; internal errors exit `1`.
- `--json` prints `{ schemaVersion: "1.0", command: "fix", ok, exitCode, dryRun, applied, skipped, reverify?, summary }`, where `reverify` (`ok`, `failures`, `warnings`, `exitCode`) is omitted on dry runs.

## Relationship to `plan` / `apply`
`fix` remains a convenience remediation path for local/manual operation.

`fix` is not the primary serious-user onboarding path.

- Use `fix` when you want direct command-driven remediation with operator flags such as `--dry-run`, `--yes`, or `--only`.
- Use `plan` + `apply` when you need explicit, reviewable remediation intent and artifact-driven execution for CI/agent automation.

Both paths target deterministic safe autofixes, but `plan`/`apply` is the canonical automation contract surface.
