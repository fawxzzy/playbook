# `pnpm playbook plan`

Generate a deterministic remediation task plan from current verify findings.

## Common usage

- `pnpm playbook plan`
- `pnpm playbook plan --json`
- `pnpm playbook plan --json --out .playbook/plan.json`
- `pnpm playbook plan --run-id <run-id> --json`

## Implemented behavior

- Produces a plan contract with stable `tasks` ordering derived from verify findings.
- Emits a canonical `remediation.status` (`ready`, `not_needed`, `unavailable`).
- Records plan execution step metadata in runtime session state.
- In `--json` mode, always persists canonical lifecycle state to `.playbook/plan.json` on successful runs, including no-op (`tasks: []`) outcomes. Text mode only renders the plan and does not write the artifact (tracked as `TM-GAP-08` in `docs/architecture/REMEDIATION_TRUST_MODEL.md`).
- Labels every task with `changeLevel` (`1` reviewed built-in docs, notes and ignore-file fixes; `2` scoped module or manifest changes and any rule id without a reviewed built-in handler; `3` security-sensitive or unconfinable paths). The label is derived deterministically from `ruleId` and `file`; see the trust model for the classification rules.
- Built-in auto-fix tasks declare the file their handler writes (`notes.missing` and `notes.empty` declare `docs/PLAYBOOK_NOTES.md`; `PB012`/`PB013` declare `.playbookignore`/`.gitignore`), so the change-scope written next to `.playbook/plan.json` carries write authority for exactly that file and `apply --from-plan .playbook/plan.json` works with it present. `PB014` has no single target and still declares `file: null` (`TM-GAP-15`).
- When `--repo <target>` is used, lifecycle artifacts are persisted in the target repository's `.playbook/` directory.
- `--out <path>` writes the JSON artifact when using JSON mode.
- `--run-id <id>` attaches planning to an existing execution run; otherwise a run is created/resolved automatically.

`--ci` is a global option and only affects text-mode verbosity (`--quiet` behavior); it does not change plan semantics.

## Contract notes

- JSON output includes `schemaVersion`, `command`, `ok`, `exitCode`, `verify`, `remediation`, and `tasks`.
- `pnpm playbook apply --from-plan <artifact>` consumes this contract.
- Task objects keep stable fields (`id`, `ruleId`, `file`, `action`, `autoFix`) for deterministic automation, plus `changeLevel` (`1 | 2 | 3`). `changeLevel` is additive: it does not affect task ids or ordering.
- `apply` rejects Level 3 auto-fix tasks. Treat `changeLevel: 3` tasks as advisory: they need human review and are not auto-applied.

## JSON example

```json
{
  "schemaVersion": "1.0",
  "command": "plan",
  "ok": true,
  "exitCode": 0,
  "verify": {
    "ok": false,
    "summary": { "failures": 1, "warnings": 0 },
    "failures": [],
    "warnings": []
  },
  "remediation": {
    "status": "ready",
    "totalSteps": 1,
    "unresolvedFailures": 0
  },
  "tasks": [
    {
      "id": "<stable-task-id>",
      "ruleId": "requireNotesOnChanges",
      "file": "docs/PLAYBOOK_NOTES.md",
      "action": "append notes entry",
      "autoFix": true,
      "changeLevel": 1
    }
  ]
}
```
