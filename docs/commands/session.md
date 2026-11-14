# `pnpm playbook session`

## What it does
`pnpm playbook session` manages repo-scoped session state and chat-snapshot workflows. It has two groups of subcommands:

- Session continuity: `show`, `pin`, `resume`, `clear` operate on `.playbook/session.json`.
- Snapshot workflows: `import`, `merge`, `cleanup` operate on session snapshot JSON files (default directory `.playbook/sessions`).

Running `session` with no subcommand, or an unknown one, exits with a failure and prints the usage `playbook session <import|merge|cleanup|show|pin|resume|clear> [options]`.

## Common usage
- `pnpm playbook session show --json`
- `pnpm playbook session pin .playbook/plan.json --kind plan`
- `pnpm playbook session resume`
- `pnpm playbook session clear`
- `pnpm playbook session import --in ./chat.txt --store`
- `pnpm playbook session merge --in a.json --in b.json --out merged.json --report merge.md`
- `pnpm playbook session cleanup --dry-run --max-days 30 --max-count 20 --hygiene`

## Session artifacts
- `.playbook/session.json` is the continuity anchor: `sessionId`, `activeGoal`, `selectedRunId`, `pinnedArtifacts`, `currentStep`, `unresolvedQuestions`, `constraints`, `lastUpdatedTime`, and an `evidenceEnvelope`.
- The `evidenceEnvelope` (schema: `packages/contracts/src/session-evidence-envelope.schema.json`) references existing artifacts instead of replacing them: artifact references with a `present` flag, proposal ids, policy decisions, an execution-result summary, and ordered lineage (`session`, `proposal_generation`, `policy_evaluation`, `pr_review`, `execution_result`).
- `.playbook/session-evidence.json` (`kind: "playbook-session-evidence"`) is written alongside the session and adds pinned/approval/receipt/plan/run references, source artifact fingerprints, and an `invalidation` block (`fresh` or `drifted`, with stale reasons). Its authority is read-only; it does not execute or mutate anything.
- `verify`, `plan`, and `apply` attach their run state to the session as they run.

## Subcommands
- `show`: prints the current session (goal, selected run, pinned artifact count, active evidence refs, latest run and receipt count) and continuity signals. With `--json` it adds a `continuity` block (`active_session_refs`, `pinned_evidence_refs`, `latest_run_id`, `latest_receipt_refs`, `missing_session_refs`, `stale_or_missing_state`) and a longitudinal-state summary. Stale signals: `selected_run_missing`, `selected_run_not_latest`, `session_older_than_latest_run`, `session_evidence_missing_artifacts`, `latest_run_missing_receipts`. With no session it reports so and exits successfully.
- `pin <artifact>` (or `--artifact <path>`): pins an artifact, creating the session if needed. `--kind` is one of `finding`, `plan`, `run`, `pattern`, `artifact`.
- `resume`: reloads the session and exits with the policy-failure code (`3`) plus warnings when pinned artifacts or the selected run are missing; otherwise exits 0.
- `clear`: removes the session state; succeeds whether or not a session existed.
- `import --in <file>`: converts chat text into a snapshot. Output goes to `--out`, else `.playbook/sessions/` with `--store`, else next to the input as `<name>.snapshot.json`. `--name` sets the source name.
- `merge --in <snapshot> --in <snapshot> --out <file>`: needs at least two inputs (files, directories, or globs). `--report <md>` and `--json-report <file>` write reports. Exits with the policy-failure code (`3`) when conflicts are found.
- `cleanup`: prunes snapshots in `--sessions-dir` (default `.playbook/sessions`) by `--max-days` / `--max-count`; `--hygiene` also deduplicates and compacts entries (`--max-entry-length`); `--dry-run` previews; `--json-report <file>` writes the result.

## Notable flags
- `--json` / `--format json`: machine-readable output.
- `--quiet`: suppress text output.

## Verification evidence
- Engine: `packages/engine/test/session.store.test.ts` (initialize, pin/resume warnings, envelope references and lineage, run-state attach and clear) and `packages/engine/src/session/sessionStore.test.ts` (deterministic session-evidence artifact, graceful degradation, fingerprint drift).
- CLI: `packages/cli/src/commands/session.test.ts` covers `resolveSessionMergeInputs` (file, directory, and glob inputs) only; the other subcommands are covered through the engine tests above.

## Related
- `docs/architecture/PLAYBOOK_SESSION_EVIDENCE_ARCHITECTURE.md`
