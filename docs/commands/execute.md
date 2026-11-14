# `pnpm playbook execute`

Execute orchestration lanes through the execution supervisor runtime, or bridge deterministic adoption prompts into canonical receipt/updated-state ingestion through an external worker adapter.

## Usage

- `pnpm playbook execute --json`
- `pnpm playbook execute --worker-adapter "<command>" --json`

Options: `--json` / `--format <text|json>`, `--quiet` (suppresses success text), `--worker-adapter <command>`, `--help`.

## Supervisor mode (default)

Prerequisites, all produced by earlier commands:

- `.playbook/workset-plan.json` from [`orchestrate`](./orchestrate.md). If it is missing, `execute` fails (`execute.workset-plan.missing`, exit `1`) and tells you to run `orchestrate`.
- `.playbook/worker-launch-plan.json` from [`workers`](./workers.md) (`workers assign`), which must be current for the workset and authorize at least one lane. Findings when it does not: `execute.worker-launch-plan.missing`, `.stale`, `.blocked`, `.no-eligible-lanes`; a failing runtime capability check reports `execute.runtime-capability-authorization.blocked`. All exit `1`.

Behavior:

- Starts an execution run, then walks the launch-authorized lanes in order. Lanes already `completed` in a resumed run are reported in `resumed_lane_ids` and skipped.
- It does **not** launch workers. For every other authorized lane it records the lane as `running` and then records a worker result with `status: "completed"` and the summary `deterministic execution success (launch-authorized)`. Treat the run as lane-state bookkeeping and merge-guard evaluation over launch-authorized lanes, not as proof that any work was done.
- Finalizes the run and evaluates the execution merge guard for it.
- Exit `0` when the final execution status is `completed`; exit `1` otherwise (`RUNNING` or `FAILED`).

Artifacts written: `.playbook/execution-state.json`, `.playbook/execution-runs/` (per-run records), `.playbook/execution-merge-guards.json`. It also reads `.playbook/lifeline-interop-runtime.json` when evaluating runtime capability authorization.

JSON output (`--json`): `schemaVersion`, `command: "execute"`, `run_id`, `execution_state_path`, `orchestration_runs_path`, `resumed_lane_ids`, `lanes` (sorted by `lane_id`, each with `lane_id` and `state`), `execution_status` (`SUCCESS`, `RUNNING` or `FAILED`), `execution_merge_guards_path`, `runtime_capability_fingerprint`, `merge_guard`.

## Bridge mode (`--worker-adapter <command>`)

- Builds the fleet adoption work queue and Codex execution plan from the connected repositories, then runs `<command>` once per prompt (sorted by `prompt_id`) through the shell, with a JSON envelope on stdin (`repo_id`, `prompt_id`, `lane_id`, `wave`, `objective`, `implementation_plan`, `verification_steps`, `documentation_updates`).
- The adapter must print a JSON result whose `prompt_id` and `repo_id` match the prompt, with a `status` and optionally `observed_transition` (`{ from, to }`) and `error`. A non-zero adapter exit, an invalid result, or an id mismatch aborts the run with exit `1`.
- Results are ingested through the receipt path (see [`receipt.md`](./receipt.md)): it writes `.playbook/execution-outcome-input.json` and `.playbook/execution-updated-state.json` (plus a staged updated-state candidate).
- Exit `0` when the updated-state candidate is validated and promoted; `1` when promotion is blocked.
- JSON output has `mode: "bridge"`, `worker_adapter`, `prompts_executed`, `execution_outcome_input`, `receipt`, `updated_state`, `next_queue`, `promotion` and `written_artifacts`.

See also: [`orchestrate.md`](./orchestrate.md), [`lanes.md`](./lanes.md), [`workers.md`](./workers.md), [`cycle.md`](./cycle.md), [`receipt.md`](./receipt.md).
