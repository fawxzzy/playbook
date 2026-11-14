# `pnpm playbook rendezvous`

Create, inspect and dry-run-release the artifact rendezvous manifest: a read-first readiness surface (pause / resume / release) built from the canonical test-remediation artifacts.

## Usage

- `pnpm playbook rendezvous create --json`
- `pnpm playbook rendezvous status --json`
- `pnpm playbook rendezvous release --dry-run --json`

## Subcommands

- `create`: builds or updates `.playbook/rendezvous-manifest.json` from the canonical remediation artifacts. This is the only subcommand that writes. Exits `0`.
- `status`: evaluates readiness from the manifest plus the artifacts observed on disk and the current git SHA, and prints a next action. Exits `0` whatever the readiness state (the state is data, not a failure). Fails (exit `1`) when the manifest is missing or invalid.
- `release --dry-run`: evaluates only the release gate. It is the only supported release form in v1 (`release` without `--dry-run` fails, exit `1`; there is no mutation path). Exits `0` when the evaluation is `releaseReady` (state `complete` with no blockers) and `1` otherwise.

Running `rendezvous` with no subcommand (or `help`) prints the usage and exits `1`; `--help` exits `0`; an unknown subcommand exits `1`.

## Observed artifacts

The evaluation looks for these artifacts, written by other commands (see [`test-triage.md`](./test-triage.md), [`test-fix-plan.md`](./test-fix-plan.md), [`test-autofix.md`](./test-autofix.md), [`remediation-status.md`](./remediation-status.md)):

- `.playbook/test-triage.json`
- `.playbook/test-fix-plan.json`
- `.playbook/test-autofix-apply.json` (the `apply-result` artifact)
- `.playbook/test-autofix.json`
- `.playbook/remediation-status.json`

## JSON output

`status` and `release` print `schemaVersion`, `command: "rendezvous"`, `subcommand`, `manifestPath`, `manifest`, `evaluation` (including `state`, `releaseReady` and the blockers), `observedArtifacts`, `currentSha`, `nextAction`, and `dryRun` for `release`. `create` prints the created manifest payload.

## Related

- [`interop.md`](./interop.md) consumes the rendezvous manifest and evaluation when emitting bounded Fitness action requests.
