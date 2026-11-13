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
- Classification precedence: path that cannot be confined to the repository (Level 3) > security-sensitive path (Level 3) > reviewed built-in rule id > default (Level 2). A rule id outside the built-in table is never below Level 2, even for a docs path, because its handler has not been reviewed.
  - Path forms: classification runs on the canonical repo-relative form of `file`, not the raw string. `.`/`..` segments are resolved, `.//` and repeated `./` collapse, backslashes become `/`, absolute paths inside the repository are made repo-relative (when the repository root is known), trailing dots and spaces are stripped from each segment (Windows ignores them), and the result is lowercased. A path that escapes the repository, or is absolute with no repository root to resolve against, is Level 3. So `docs/../.github/workflows/ci.yml`, `.//.github/x.yml`, `.github./x.yml`, `.GITHUB/x.yml`, `a/../.npmrc` and `docs/../secrets/x` are all Level 3.
  - Level 3 paths: `.github/`, `.git/`, `.husky/`, `.env` and `.env.*` files (so `.env.example` and `.env.sample` are Level 3 too, deliberately), `.npmrc`, `.yarnrc`, `.yarnrc.yml`, and any `secrets/` path segment.
  - Built-in rule ids: `notes.missing`, `notes.empty`, `PB012`, `PB013`, `PB014`, and `docs-consolidation.managed-write` are Level 1; `release.package-json.version` is Level 2.
- A plan artifact may declare `changeLevel` on a task. A declared level can raise the effective level but never lower it below the classified level (`resolveTaskChangeLevel`). `parsePlanArtifact` rejects a declared value that is not `1`, `2`, or `3`.
- `apply` rejects the whole selection before any handler runs when any auto-fix task resolves above Level 2 (`enforceChangeLevelCeiling`, called from `validateRemediationPlan`, which both `apply` and `FixExecutor` invoke; `FixExecutor` is the check that sees which rule ids have plugin handlers). A rule id served by a plugin-registered handler is never below Level 2, including built-in rule ids a plugin overrides. Non-auto-fix tasks are skipped by `apply` and are not gated.
- Explicit Level 3 override (`TM-GAP-01`, closed): `playbook apply --allow-level 3 --reason "<text>"` (or `--allow-level=3` / `--reason=<text>`). Both flags are required together, each exactly once with a value; only `3` is accepted; the reason is trimmed, at most 400 characters, needs a visible non-space character, and may not contain control, format (bidi override, zero-width) or line/paragraph separator characters. With the override the ceiling is raised to Level 3 for that run. It is recorded as an `apply.change-level-override.v1` memory event written *before* the executor runs (intent; lists tasks declared above Level 2; best-effort, a capture failure never blocks apply; reason secret-redacted) and as `changeLevelOverride` in the apply JSON result (`allowLevel`, `reason`, `overriddenTaskIds`, where `overriddenTaskIds` includes tasks that passed only because of the override, including those caught by the reported-write check). Without both flags Level 3 stays rejected. The override applies to standard `apply` only: it is rejected with `--policy` / `--policy-check` and with maintenance-plan execution. Library entry points (`applyExecutionPlan` `changeLevelOverride`, `FixExecutor.apply` / `validateRemediationPlan` `maxChangeLevel` above 2) require a valid reason and throw without one. The default ceiling is unchanged (`DEFAULT_MAX_APPLY_CHANGE_LEVEL` = 2).
- Maintenance-plan branch (`TM-GAP-06`, closed): `apply --from-plan <maintenance-plan>` now runs its tasks through `validateRemediationPlan` (as executable tasks, rule id `maintenance.execution`, Level 2) before any maintenance command is executed, so task-count, duplicate-id, action-length and change-level checks apply to it.
- Change-scope binding (`TM-GAP-07`, closed for plan-artifact applies): `plan --json` stamps its change-scope bundle with `source.artifactDigest`, a sha256 over the plan's ordered tasks (`computePlanArtifactDigest`: id, rule, file, action, `autoFix`, `task_kind`, plus hashes of `write` and `preconditions`; null and undefined hash alike; additive labels such as `changeLevel` are excluded). When `--from-plan` is a `plan` artifact, `apply` refuses, before enforcing or mutating anything, a change-scope written by another command (for example `analyze-pr`), without a digest, or with a different digest (`assertApplyChangeScopeBinding`); the remedy is to re-run `playbook plan --json` or remove `.playbook/change-scope.json`. Release, test-fix, docs-consolidation and maintenance plans never read the scope file, so a leftover scope cannot block `release sync` or `test-autofix`. Without `--from-plan` the scope limits are enforced as before with no digest check (tasks are regenerated, not loaded from the artifact the scope describes).
- Handler-reported writes (`TM-GAP-11`, closed as post-write detection): after a handler returns `applied`, each reported `filesChanged` path is canonicalized and level-checked against the ceiling. A Level 3 path with no override fails that task with a `Change-level violation` message and halts the run: remaining tasks are reported `skipped` ("an earlier task reported a write above the change-level ceiling") and the exit code is a failure. This detects and stops; it cannot undo the write that already happened (see `TM-GAP-10`).
- A plugin task with `file: null` cannot be path-classified before it runs and is Level 2; only its reported writes are level-checked, after the fact.
- Existing guards stay in force: repository-boundary and symlink checks, the file-extension allow-list, task-count and action-length limits, per-handler `filesChanged` boundary validation, and the optional change-scope file/patch-budget check.

## Not yet enforced

Named open gaps. Each is current behavior, not a promise of the code above; none is a regression.

- `TM-GAP-02` Default ceiling is Level 2, not Level 1: the "Safety baseline" says Level 1 automation is allowed by default and Level 2+ needs stronger scope constraints. The shipped release flow (`release.package-json.version`) is Level 2, so a Level 1 default would break it. Choosing the default ceiling is a product decision; the ceiling value is the single constant `DEFAULT_MAX_APPLY_CHANGE_LEVEL`.
- `TM-GAP-03` Level 2 versus Level 3 module boundaries: Level 2 means "one owned module boundary" and Level 3 means "cross-module". Classification looks at one task at a time and has no module-ownership map, so a plan spanning several modules is not escalated.
- `TM-GAP-04` Level 3 path list is a minimal fixed set. It does not cover other security-sensitive surfaces (for example auth or deployment configuration outside `.github/`). Extending it changes which plugin fixes are rejected and needs an owner decision.
- `TM-GAP-05` `apply` results and the `playbook-release-plan`, `test-fix-plan`, and `docs-consolidate-plan` artifacts do not carry `changeLevel`. The release-plan task schema is `additionalProperties: false`, so adding it there is a contract change. `apply` still classifies every task itself, so enforcement does not depend on the label being present.
- `TM-GAP-08` `plan` text mode does not persist `.playbook/plan.json` or `.playbook/change-scope.json`; only `--json` mode does (`packages/cli/src/commands/plan.ts`). `docs/commands/plan.md` is aligned to this behavior.
- `TM-GAP-09` Extensionless and `.yml`/`.yaml`/`.json` targets pass the extension allow-list. Their protection is the Level 3 path list above, not the allow-list.
- `TM-GAP-10` Plugin handler precedence and pre-write prevention: a plugin handler registered for a `ruleId` overrides the built-in handler (`HandlerResolver.resolve` in `packages/engine/src/execution/fixExecutor.ts`). Such tasks are floored at Level 2 and their reported writes are level-checked, but only after the write: a plugin handler (or a `file: null` task) can still write to a Level 3 path before the check fails the run. Preventing the write needs a pre-write contract (handlers declaring their write set before running), which is a contract change and is not implemented.
- `TM-GAP-12` The Level 3 override is a recorded declaration, not an authenticated approval: anyone who can run `apply` can pass `--allow-level 3 --reason`. The reason and the overridden task ids are auditable (apply result and memory event), but there is no out-of-band approver identity or signed approval artifact.
- `TM-GAP-13` Change-scope remains optional and unauthenticated: when `.playbook/change-scope.json` does not exist, `apply` enforces no file or patch-size scope at all; binding only decides whether an existing scope file may be used for a `plan` artifact, and the scope file itself is unauthenticated (integrity-only binding: anyone who can write both files can make them agree).
- `TM-GAP-14` `plan --json` followed by `apply` fails closed for plans whose tasks declare no `file` (for example `notes.missing`): the scope bundle gets `proposal-only-no-write-authority` instead of `writes-must-stay-inside-allowedFiles`, and `enforceApplyChangeScope` then reports `required boundary checks are missing`. This predates the binding work and was verified on a real `plan --json` then `apply --from-plan .playbook/plan.json`; plans with at least one file-bearing task are unaffected. Fixing it means deciding whether a no-file plan should carry write authority or skip scope enforcement, which is a product decision.
- Related lexical limits: classification does not resolve Windows 8.3 short names or NTFS alternate data streams; symlink traversal is covered by the repository-boundary guard, not by classification.
- Remediation safety telemetry for CI auditing (roadmap item "Remediation trust model enforcement") is not implemented.

## Closed gaps

Gaps from the earlier "Not yet enforced" list that are now enforced and tested:

- `TM-GAP-01` Override contract: closed by `apply --allow-level 3 --reason` (see Enforcement status). Residual: `TM-GAP-12`.
- `TM-GAP-06` Maintenance-plan branch bypassed validation: closed; the branch validates before executing. Maintenance commands are a fixed reviewed set, so the check is plan hygiene and the Level 2 classification, not file scoping.
- `TM-GAP-07` Change-scope last-writer-wins: closed for `plan`-artifact applies by digest binding (release, fix and maintenance plans no longer read the scope file). Residual: `TM-GAP-13` (scope is optional and unauthenticated) and `TM-GAP-14` (no-file plans fail closed).
- `TM-GAP-11` Handler-reported writes not level-checked: closed as detection and halt after the write. Residual: `TM-GAP-10` (no pre-write prevention).

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
