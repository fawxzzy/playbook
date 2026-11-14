# `pnpm playbook security`

Inspect deterministic security baseline findings and summary captured in `.playbook/security-baseline.json`.

## Usage

- `pnpm playbook security baseline` (all baseline findings)
- `pnpm playbook security baseline show <package>` (findings for one package)
- `pnpm playbook security baseline summary` (counts by status and severity)
- add `--json` for machine-readable output, `--quiet` to suppress text output

`baseline` is the only subcommand of `security`. Any other subcommand prints `playbook security: unsupported subcommand. Use "playbook security baseline".` and exits `1`; no subcommand prints the usage and exits `1`; `--help` with a subcommand exits `0`.

## Behavior

- Read-only. It does not scan anything: it reads `.playbook/security-baseline.json`, a Grype baseline artifact captured in CI (`.github/workflows/security.yml` uploads it as the `security-baseline` artifact). When the file is missing the command fails with `playbook security baseline: missing .playbook/security-baseline.json. Capture baseline findings in CI first.` (exit `1`; with `--json` the error is `{ "schemaVersion": "1.0", "command": "security-baseline", "error": "..." }`).
- `baseline show <package>` without a package name fails with `missing <package> argument` (exit `1`). Successful runs exit `0`.
- Text output lists each finding as `<package>@<installed_version> <vulnerability_id> [<severity>] (<status>; <direct|transitive>; <ecosystem>; path: <dependency_path>)`. `summary` prints the generation time, total findings, and counts by status and by severity.
- JSON output is the artifact payload plus a `command` field: `security-baseline`, or `security-baseline-show` (with `package`) for `show`. `summary` prints the summary object.

## Related

- `pnpm test:security` runs the security contract and regression tests (a root script, separate from this command).
- Policy and program documentation: [`../security/`](../security/).
