# Plan/Apply Override Contract

Pointer contract for the only supported override of the `apply` change-level ceiling. Normative detail lives in the three linked docs; this page summarizes what the implementation does (`packages/cli/src/commands/apply.ts`, `packages/cli/src/lib/changeLevelOverride.ts`, `packages/engine/src/execution/changeLevel.ts`, `packages/engine/src/memory/runtimeEvents.ts`).

Sources:

- [Remediation trust model](../architecture/REMEDIATION_TRUST_MODEL.md)
- [`plan` command](../commands/plan.md)
- [`apply` command](../commands/apply.md)

## Default behavior

- `plan` emits a `changeLevel` (`1 | 2 | 3`) on each task. It is additive and does not affect task ids or ordering.
- `apply` runs only `autoFix: true` tasks and rejects the whole selection, before any handler runs, if any task resolves above Level 2.
- A task's level is the highest of its declared `changeLevel`, the level classified from `ruleId` and repo-relative `file`, and Level 2 for plugin-handled or unknown rule ids. A plan artifact cannot lower it.
- Level 3 covers security-sensitive paths (`.github/`, `.git/`, `.husky/`, `.env*`, `.npmrc`, `secrets/`, `playbook.config.json`, `vercel.json`, `CODEOWNERS`, `.gitmodules`, `.vercel/`, a root `supabase/` directory, and any `/supabase/migrations/` path).

## Override

```bash
pnpm playbook apply --from-plan .playbook/plan.json --allow-level 3 --reason "<why>"
```

- `--allow-level 3` and `--reason <text>` are both required, each exactly once, with a value. `--allow-level=3` and `--reason=<text>` forms are accepted.
- Only `3` is accepted as the level.
- The reason is trimmed, at most 400 characters (`MAX_OVERRIDE_REASON_LENGTH`), must contain a letter, number, punctuation or symbol, and is rejected if it contains control, format (bidi, zero-width), separator, surrogate, private-use or unassigned code points, invisible fillers, or a lone combining mark.
- Standard `apply` only. It is rejected with `--policy` / `--policy-check` and with maintenance-plan execution (rejected before an execution run is created).

## Recorded evidence

- `changeLevelOverride` in the `apply --json` result: `allowLevel`, `reason`, `overriddenTaskIds`.
- A memory event `apply.change-level-override.v1`, written before the executor runs. Capture is best-effort and never blocks apply; the reason is secret-redacted.

## Post-write check and exit behavior

- After each handler reports `applied`, every reported `filesChanged` path is level-checked against the ceiling. A Level 3 write without the override fails that task and halts the run: remaining tasks are `skipped` and the exit code is a failure. This detects after the write; it cannot undo it (`TM-GAP-10`).
- Invalid override input (missing partner flag, bad level, bad reason) is an error before any execution.
- Library callers (`applyExecutionPlan` `changeLevelOverride`, `FixExecutor.apply` `maxChangeLevel`, `validateRemediationPlan` `maxChangeLevel`) must supply a valid reason or they throw.

## Limits

The override is a recorded declaration, not an authenticated approval (`TM-GAP-12`): there is no approver identity or signed approval artifact.
