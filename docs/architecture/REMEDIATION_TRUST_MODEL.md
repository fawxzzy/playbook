# Remediation Trust Model

Remediation features require defined trust boundaries and change-scope levels.

## Scope

This model governs `pnpm playbook verify`, `pnpm playbook plan`, and `pnpm playbook apply` execution boundaries.

## Trust boundary principles

- `verify`: read-only analysis and policy evaluation.
- `plan`: deterministic proposal generation from failures; it never changes repository source. It writes only `.playbook/` runtime artifacts (`plan.json` and `change-scope.json` in `--json` mode, the execution run, and memory events).
- `apply`: bounded executor that may mutate repository content only through approved plan tasks.

## Change levels

### Level 0 — Read-only analysis

- Commands: `verify`, `analyze`, `query`, `explain`, `ask`, `rules`, `docs audit`
- Allowed actions: inspect repository state and emit diagnostics
- Forbidden actions: file mutation

### Level 1 — Docs/tests/generated artifacts

- Commands: bounded `apply` tasks that modify docs, tests, or generated runtime artifacts
- Examples: update `.gitignore` artifact entries, regenerate `.playbook` runtime artifacts
- Risk profile: low, broadly reversible

### Level 2 — Scoped module code changes

- Commands: future deterministic auto-fixes limited to one owned module boundary
- Requirements: explicit rule mapping, deterministic patch shape, contract tests
- Risk profile: medium

### Level 3 — Cross-module or security-sensitive changes

- Commands: never auto-applied by default
- Requirements: explicit human review and out-of-band approval gates
- Risk profile: high

## Enforcement expectations

- Plans must classify each task with explicit change-level metadata.
- `apply` must reject tasks above configured trust level unless an explicit override contract exists.
- JSON contracts should keep change-level intent machine-readable for CI/auditors.

## Enforcement status

Implemented and covered by tests (contract: `docs/contracts/security/change-level.json`):

- `pnpm playbook plan --json` labels every task with `changeLevel` (`1`, `2`, or `3`). The label is derived deterministically from `ruleId` and `file` by `classifyTaskChangeLevel` (`packages/engine/src/execution/changeLevel.ts`). Level 0 is read-only analysis and never labels a task, because tasks describe mutations.
- Classification precedence: security-sensitive path (Level 3) > reviewed built-in rule id > path shape (docs, tests, `.playbook/`, `.gitignore`, `.playbookignore` are Level 1) > default (Level 2).
  - Level 3 paths: `.github/`, `.git/`, `.husky/`, `.env` and `.env.*` files, `.npmrc`, `.yarnrc`, `.yarnrc.yml`, and any `secrets/` path segment.
  - Built-in rule ids: `notes.missing`, `notes.empty`, `PB012`, `PB013`, `PB014`, and `docs-consolidation.managed-write` are Level 1; `release.package-json.version` is Level 2.
- A plan artifact may declare `changeLevel` on a task. A declared level can raise the effective level but never lower it below the classified level (`resolveTaskChangeLevel`). `parsePlanArtifact` rejects a declared value that is not `1`, `2`, or `3`.
- `apply` rejects the whole selection before any handler runs when any auto-fix task resolves above Level 2 (`enforceChangeLevelCeiling`, called from `validateRemediationPlan`, which both `apply` and `FixExecutor` invoke). Plugin handlers do not bypass this check. Non-auto-fix tasks are skipped by `apply` and are not gated.
- Existing guards stay in force: repository-boundary and symlink checks, the file-extension allow-list, task-count and action-length limits, per-handler `filesChanged` boundary validation, and the optional change-scope file/patch-budget check.

## Not yet enforced

Named open gaps. Each is current behavior, not a promise of the code above; none is a regression.

- `TM-GAP-01` Override contract: the model says `apply` may exceed the ceiling "unless an explicit override contract exists". No such contract or flag exists, so Level 3 is rejected with no sanctioned path to approve it. Defining the approval artifact and CLI surface is a product decision.
- `TM-GAP-02` Default ceiling is Level 2, not Level 1: the "Safety baseline" says Level 1 automation is allowed by default and Level 2+ needs stronger scope constraints. The shipped release flow (`release.package-json.version`) is Level 2, so a Level 1 default would break it. Choosing the default ceiling is a product decision; the ceiling value is the single constant `DEFAULT_MAX_APPLY_CHANGE_LEVEL`.
- `TM-GAP-03` Level 2 versus Level 3 module boundaries: Level 2 means "one owned module boundary" and Level 3 means "cross-module". Classification looks at one task at a time and has no module-ownership map, so a plan spanning several modules is not escalated.
- `TM-GAP-04` Level 3 path list is a minimal fixed set. It does not cover other security-sensitive surfaces (for example auth or deployment configuration outside `.github/`). Extending it changes which plugin fixes are rejected and needs an owner decision.
- `TM-GAP-05` `apply` results and the `playbook-release-plan`, `test-fix-plan`, and `docs-consolidate-plan` artifacts do not carry `changeLevel`. The release-plan task schema is `additionalProperties: false`, so adding it there is a contract change. `apply` still classifies every task itself, so enforcement does not depend on the label being present.
- `TM-GAP-06` Approval-gated maintenance plans: `apply --from-plan` on a maintenance plan runs bounded shell commands in an early branch that returns before `validateRemediationPlan` and the change-scope check (`packages/cli/src/commands/apply.ts`, maintenance branch). Its boundary is the approval, policy, and target-surface evidence in that artifact, not a change level.
- `TM-GAP-07` Change-scope artifact is last-writer-wins: `.playbook/change-scope.json` holds a single bundle that `plan` and `analyze-pr` both overwrite (`writeChangeScopeArtifact`). `apply` enforces whichever bundle was written last and does not check that it matches the plan artifact being applied (`--from-plan <other-file>`). When no change-scope file exists, scope enforcement is skipped entirely.
- `TM-GAP-08` `plan` text mode does not persist `.playbook/plan.json` or `.playbook/change-scope.json`; only `--json` mode does (`packages/cli/src/commands/plan.ts`). `docs/commands/plan.md` is aligned to this behavior.
- `TM-GAP-09` Extensionless and `.yml`/`.yaml`/`.json` targets pass the extension allow-list. Their protection is the Level 3 path list above, not the allow-list.
- `TM-GAP-10` Plugin handler precedence: a plugin handler registered for a `ruleId` overrides the built-in handler (`HandlerResolver.resolve` in `packages/engine/src/execution/fixExecutor.ts`). The change-level ceiling bounds what a plugin may be asked to touch; it does not constrain what an approved plugin handler does inside that path beyond the `filesChanged` boundary check.
- Remediation safety telemetry for CI auditing (roadmap item "Remediation trust model enforcement") is not implemented.

## Safety baseline

Default safety posture:

- Read-only and Level 1 automation allowed under deterministic policy controls.
- Level 2+ requires stronger scope constraints and human-reviewed rollout.
- Level 3 remains advisory-only in default Playbook operation.


## Diagnosis-before-repair test governance

Contract snapshot hardening reinforced a core remediation boundary: isolate diagnosis from repair. When fixtures were split so each contract test owned its own inputs, they exposed hidden producer/consumer dependencies that earlier shared fixture state had been masking.

- `test-triage` belongs on the diagnosis side of the boundary: classify failure shape first, then plan repair.
- `test-fix-plan` is the bounded bridge artifact: it may only convert pre-approved low-risk diagnosis classes into apply-compatible tasks with preserved provenance.
- Merge-time automation must not paper over missing prerequisite artifacts by mutating repo state blindly.
- Consumer commands and snapshot tests should declare prerequisite artifact producers explicitly instead of relying on prior command side effects.

Rule: isolated contract fixtures force hidden producer/consumer dependencies into the open.
Pattern: contract snapshots work best when every consumer command declares its prerequisite artifact producers explicitly.
Failure Mode: shared fixture state makes snapshots look stable while silently depending on prior command side effects.
