# `pnpm playbook demo`

Show the official Playbook demo repository and its guided first-run workflow.

## Usage

- `pnpm playbook demo`
- `pnpm playbook demo --json`
- `pnpm playbook demo --quiet` (suppresses text output; `--json` still prints)

## Behavior

- Print-only and deterministic: it does not clone, open, install or run anything, and it reads no repository state. It exits `0`.
- Text output lists the demo repository (`https://github.com/fawxzzy/playbook-demo`), a quick-start command list, the expected initial state (first `verify` fails, `plan` produces reviewed tasks, `apply` executes bounded plan tasks, final `verify` passes) and what the demo demonstrates.
- The quick-start list follows the canonical ladder (`ai-context`, `ai-contract`, `context`, `index`, `query modules`, `explain architecture`, `verify`, `plan`, `apply`, `verify`); `fix` is not part of the onboarding path.

## JSON contract

```json
{
  "schemaVersion": "1.0",
  "command": "demo",
  "repository": { "name": "playbook-demo", "url": "https://github.com/fawxzzy/playbook-demo" },
  "workflow": ["git clone https://github.com/fawxzzy/playbook-demo", "cd playbook-demo", "..."],
  "expectedInitialFindings": {
    "firstVerifyPasses": false,
    "planProducesReviewedTasks": true,
    "applyExecutesBoundedTasks": true,
    "finalVerifyPasses": true
  },
  "demonstrates": ["..."],
  "summary": "..."
}
```

## Notes

- The printed quick-start uses `pnpm playbook ...` after `cd playbook-demo`. The demo repository does not define a `playbook` script, so run the ladder from a built checkout of this repository with `--repo` instead (see [README.md](../../README.md), "Example Output"): `pnpm playbook --repo ../playbook-demo verify --json`.
- The demo repository is a separate project (`fawxzzy/playbook-demo`); refresh automation for its committed artifacts lives in `scripts/demo-refresh.mjs` and `.github/workflows/demo-refresh.yml`.

See also: [`context.md`](./context.md), [`verify.md`](./verify.md), [`plan.md`](./plan.md), [`apply.md`](./apply.md), [`../ONBOARDING_DEMO.md`](../ONBOARDING_DEMO.md).
