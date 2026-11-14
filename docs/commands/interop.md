# `pnpm playbook interop`

Inspect and run remediation-first Playbook-to-Lifeline interop from the rendezvous artifacts. Requests are bounded actions (the Fitness action contract) recorded in a local runtime artifact; the only runner this command provides is the local mock runtime (`run-mock`).

## Usage

`pnpm playbook interop <subcommand> [options]` (the subcommand defaults to `health` when omitted). Add `--json` for machine-readable output, `--quiet` to suppress text.

Read-only subcommands, all printing parts of `.playbook/lifeline-interop-runtime.json`:

- `health`: the runtime heartbeat. `capabilities`, `requests`, `receipts`: the corresponding sections of the runtime.
- `fitness-contract`: summarizes the materialized Fitness integration contract (source repo/ref/path, sync mode, source hash, app identity, signals, state snapshots, bounded actions, receipt types).
- `followups [--type <followup-type>] [--surface <target-surface>]`: review-only listing of `.playbook/interop-followups.json`, with a summary and automation-synthesis suggestions; fails (exit `1`) when that artifact is missing.

Subcommands that write `.playbook/lifeline-interop-runtime.json`:

- `register [--capability <id>] [--action <kind>]`: registers a capability for a remediation action kind (defaults: capability `lifeline-remediation-v1`, action `adjust_upcoming_workout_load`).
- `emit [--capability <id>] [--action <kind>] [--action-input-json <json>]`: emits one bounded action request, gated on the rendezvous manifest and its evaluation (`.playbook/rendezvous-manifest.json`; see [`rendezvous.md`](./rendezvous.md)).
- `emit-fitness-plan [--capability <id>] [--action <kind>] [--action-input-json <json>] [--approved-plan]`: emits a plan-derived Fitness request. Readiness comes from the rendezvous manifest when it exists; otherwise from `.playbook/plan.json`, which then needs `--approved-plan`. It fails when neither exists.
- `emit-fitness-plan --from-draft <path>`: emits from the canonical `.playbook/interop-request-draft.json` after explicit review, re-validating action, capability, input and routing metadata against the draft before emitting. `--from-draft` cannot be combined with `--capability`, `--action` or `--action-input-json`.
- `run-mock [--runtime <id>]`: runs the local mock Lifeline runtime once (default runtime id `lifeline-mock-runtime`) to produce receipts.
- `reconcile`: reconciles the runtime and writes the resulting state; JSON output points at `.playbook/lifeline-interop-runtime.json`.

Draft compilation (writes `.playbook/interop-request-draft.json`):

- `draft [--from-proposal <path>]`: compiles a request draft from an AI proposal artifact (default `.playbook/ai-proposal.json`, see [`ai.md`](./ai.md)) and prints the draft id, proposal id, target, action, capability and expected receipt type.

`--action` must be one of the action names in the Fitness integration contract (`interop fitness-contract` lists them); anything else fails with `Unsupported --action <name>`.

## Exit codes and errors

- `0` on success, including `--help`.
- `1` when a subcommand throws (missing artifacts, unsupported action, invalid `--action-input-json`, draft mismatch); with `--json` the error is printed as `{ "schemaVersion": "1.0", "command": "interop", "error": "..." }`.
- Known limitation: an unrecognized subcommand is not rejected. It falls through to the default read branch, prints the full runtime artifact and exits `0`.

## Artifacts

`.playbook/lifeline-interop-runtime.json`, `.playbook/rendezvous-manifest.json` (read), `.playbook/interop-request-draft.json`, `.playbook/interop-followups.json` (read).

See also: [`rendezvous.md`](./rendezvous.md), [`ai.md`](./ai.md), [`receipt.md`](./receipt.md).
