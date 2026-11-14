# Exit Codes

Current Playbook CLI exit behavior. The codes come from the `ExitCode` enum in `packages/cli/src/lib/cliContract.ts`; each command decides which one it returns.

| Code | Name | Meaning |
| --- | --- | --- |
| `0` | `Success` | The command completed (or printed help / `--version`). |
| `1` | `Failure` | The command failed, an unknown command was given (help is printed first), the target `--repo` could not be resolved, or an uncaught error ended the process. |
| `2` | `EnvironmentPrereq` | Reserved for a missing environment prerequisite. No command returns it today. |
| `3` | `PolicyFailure` | A governance, policy or review gate was not satisfied. |
| `4` | `WarningsOnly` | Completed with warnings that need follow-up (currently only `upgrade`). |

## `pnpm playbook analyze`

- Default text mode (no `--ci`, no `--explain`): returns `0`.
- `--json`, `--ci`, and `--explain` (text): return `0` when `result.ok` is true, else `1`.

## `pnpm playbook verify`

- Returns `0` when the verification result is `ok`.
- Returns `3` (`PolicyFailure`) when it is not `ok`, in default, `--json`, `--ci` and `--policy` modes alike. With `--local` or `--local-only`, a failed local verification command also makes the result not `ok`.
- Usage errors thrown while parsing options (for example an invalid option combination) end the process with `1`.

## `pnpm playbook doctor`
<!-- docs-merge:canonical-heading -->
> **Docs merge note:** The command documentation lives at [`pnpm playbook doctor`](../commands/doctor.md).


- Returns `1` when the report status is `error` (at least one error-severity finding), in text and `--json` modes.
- Returns `0` otherwise, including when there are only warnings.

## `pnpm playbook diagram`

- Returns `0` after successful diagram generation and file write.
- Runtime errors (for example, uncaught filesystem exceptions) cause process failure via Node error exit behavior.

## Other commands that return `3` or `4`

- `3`: `docs audit --ci` when it reports errors (without `--ci` the same condition returns `1`), `fix` when the re-verify after applying fixes is not `ok`, `status` when verify is not `ok`, `session resume` when pinned artifacts or the selected run are missing, `session merge` when conflicts are found, and `story create` / `story promote` / `story status` when the governed write is blocked.
- `4`: `upgrade` when it is blocked or when migrations are still needed.
