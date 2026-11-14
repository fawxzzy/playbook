# `pnpm playbook architecture`

Verify subsystem registry ownership and architecture mapping integrity.

## Usage

- `pnpm playbook architecture verify`
- `pnpm playbook architecture verify --json`

`verify` is the only subcommand. Any other subcommand prints `playbook architecture: unsupported subcommand. Use "playbook architecture verify".` and exits `1`; no subcommand prints the usage (`playbook architecture verify [--json]`) and exits `1`; `--help` with a subcommand prints the usage and exits `0`.

## Behavior

- Read-only. Loads the subsystem registry from `.playbook/architecture/subsystems.json` and validates it against the registered CLI command names (`docs/contracts/command-truth.json` is generated from the same metadata).
- Reports whether artifact ownership is duplicated and whether any subsystem maps to an unknown command (`Duplicate artifact ownership ...` and `Unknown command mapping ...` errors).
- Exits `0` when the registry is valid and `1` when it is not.
- A repository without `.playbook/architecture/subsystems.json` is not handled gracefully: the command throws `Architecture registry not found at .playbook/architecture/subsystems.json.` and exits `1` with a stack trace.

## JSON contract

```json
{
  "schemaVersion": "1.0",
  "command": "architecture",
  "subcommand": "verify",
  "subsystemCount": 13,
  "artifactCount": 19,
  "valid": true,
  "errors": [],
  "warnings": []
}
```

Text mode prints the subsystem and artifact counts, the duplicate-ownership and command-mapping checks, then `Architecture integrity: PASS` or `FAIL` followed by the errors, and any warnings. `--quiet` suppresses the text output.

## Related

- The registry is also read by `pnpm playbook explain subsystem|artifact|command <name>` (see [`explain.md`](./explain.md)).
- Layer ownership and closed-loop constraints: [`../architecture/overview.md`](../architecture/overview.md).
