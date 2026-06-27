# `pnpm playbook ai-contract`

Print the repository AI interaction contract used by Playbook-aware tooling.

## Usage

```bash
pnpm playbook ai-contract
pnpm playbook ai-contract --json
```

## Behavior

- Reads `.playbook/ai-contract.json` when present.
- Falls back to a deterministic generated contract when no file-backed contract exists.
- Includes additive continuity bootstrap metadata under `continuity.doctrine`, exposing the canonical `core_continuity_doctrine` role plus its registered owner contract path, canonical export path, and fail-closed registration state.
- Text mode prints runtime, workflow, intelligence sources, supported queries, remediation flow, and core rules.

## JSON output

`pnpm playbook ai-contract --json` returns:

- `schemaVersion`
- `command`
- `source` (`file` or `generated`)
- `contract` (canonical contract payload)
- `continuity`

## Related commands

- `pnpm playbook ai-context --json`
- `pnpm playbook context --json`
- `pnpm playbook schema ai-contract --json`
