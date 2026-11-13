# Changelog

## Unreleased

### WHAT

- Hardened the command-truth docs-audit rules: `docs.command-truth.bootstrap-ladder` now matches ladder commands as whole tokens (a bare `context` is no longer satisfied by `ai-context`) and names the missing commands; `docs.command-truth.classification-missing` now also compares each command's Lifecycle/Role/Discoverability cells in the `docs/commands/README.md` managed status table with `docs/contracts/command-truth.json` (warning level, additive). Added additive `questionBounded` command metadata (set on `ask`) and `plannedCommands` / `questionBoundedCommands` lists in the generated `docs/contracts/command-truth.json`, with regression tests.
- Added docs-audit regression tests for the four command-truth packaging rules (`docs.command-truth.bootstrap-ladder`, `docs.command-truth.classification-missing`, `docs.command-truth.roadmap-live-boundary`, `docs.ask-boundary.contract-missing`: compliant repo passes, each violating fixture yields the expected warning, rules are skipped when command truth is missing) and `packages/cli/src/lib/commandMetadata.test.ts`, which ties command lifecycle, role, discoverability and canonical sequence to the committed `docs/contracts/command-truth.json`.
- Routed `verifyRepo`, `runRuleExecution` (plan/apply) and `analyzeRepo` through one engine plugin-loading path, `packages/engine/src/plugins/unifiedPluginRegistry.ts`, instead of three inline copies of the reset/core/`loadPlugins` sequence; added `packages/engine/test/pluginLoadingPath.test.ts` proving all three see the same configured plugin and that no other engine module imports the plugin loader; recorded the audit facts and six named open items (plugin rule shape, plugin discovery, `rules` surface, CLI analyze plugins, core analyze adapter, repo-index rules) in `docs/architecture/V1_BOUNDARY_REFACTOR_PLAN.md`. Command output and public API are unchanged.
- Moved the roadmap statuses of the knowledge-compaction, repository-memory, session-evidence, consumer-upgrade-boundary, delivery-system, toroidal-flow, automation-synthesis, promotion, replay-consolidation, memory-aware retrieval and memory prune features to `implemented-hardening`, the pure architecture overlays (SKU, metrics/ROI, pilot rollout, knowledge persistence, graph memory) to `architecture-defined`, and the first-slice features (architecture graph, governed interface API, workspace governance, multi-repo transfer) to `in-progress`, each with the commands, tests and docs that exist. Added `test/contracts/roadmap/roadmap-dependency-graph.test.mjs` (stable IDs, no dangling or cyclic dependencies, consistent build order) and regenerated the project-board owner export (20 non-complete cards).
- Widened `scripts/validate-roadmap-contract.mjs` so shipped features (`implemented`, `implemented-hardening`, `in-progress`) of any roadmap version must declare live commands and existing contract, docs and test paths (previously only v0.9, and not tests); ignored `docs/commands/README.md` as a command family; corrected `PB-V03-INDEX-001`, `PB-V03-QUERY-001` and `PB-V09-ARCHITECTURE-ROLE-INFERENCE-001` to real artifacts; moved `PB-V06-FAILURE-INTELLIGENCE-001` from `in-progress` to `planned` because none of its declared artifacts or its `failure` command exist; bumped roadmap `updatedAt`; regenerated the project-board owner export; added validator regression tests; and used `fileURLToPath` instead of `URL.pathname` in two contract tests so they run on Windows.
- Refreshed the committed `packages/cli-wrapper/runtime` snapshot (`commands/analyze.js` and `commands/patterns.js` plus source maps) from the current build: it lagged the `analyze` engine routing and the `patterns verta` subcommand.
- Made the release fallback asset validation, `pack-smoke` extraction and the release-fallback proof run `tar` from the tarball folder with a bare file name (GNU tar under Git Bash on Windows read `C:...` as a remote host), and made the Windows launcher tests expect `%ComSpec%` (a full path on real Windows hosts) instead of the literal `cmd.exe`.
- Reworded the `PB-V1-DELIVERY-SYSTEM-001` roadmap goal ("docs and contract checks" instead of a path-like phrase), bumped `docs/roadmap/ROADMAP.json` `updatedAt`, and regenerated the project-board owner export.
- Made the project-board owner export check (`pnpm board:export:check`), its canonical-export test, and the managed-docs generator (`pnpm docs:check`) compare the LF form of committed files, so Windows checkouts that materialize them with CRLF no longer report false stale exports or managed docs; added a regression test that a CRLF-materialized export passes while real drift still fails.
- Added a reusable `.github/actions/atlas-ui-proof/action.yml` compatibility gate that reruns ATLAS semantic drift, reruns ATLAS visual proof, derives the combined proof summary, and exports completion-facing outputs for downstream workflow consumers.
- Clarified workflow-pack reuse docs so consumer-side proof gating remains a read-only compatibility layer over owner reports rather than a replacement verification truth surface.
- Introduced Simple Rule Theory and Triadic System Pattern as first-class architectural doctrines.
- Expanded Simple Rule Theory to include data refinement, invariant extraction, and minimal sufficient representation.
- Integrated these doctrines into architecture documentation, checklist guidance, and command metadata descriptions for `verify`, `plan`, and `apply`.
- Added `packages/engine/vitest.config.mjs` (30s `testTimeout` and `hookTimeout` for the engine package) and an "Engine test timeouts and heavy fixtures" section in `docs/TESTING.md`. No source, command, bridge, research, scorecard or golden-path contract changed.
- Added trust-model change levels to `plan`/`apply` (`PB-V04-PLAN-APPLY-001`): `plan --json` now labels every task with an additive `changeLevel` (`1 | 2 | 3`) derived deterministically from `ruleId` and `file`; `parsePlanArtifact` preserves and validates a declared `changeLevel`; `apply` (via `validateRemediationPlan`/`FixExecutor`) rejects any auto-fix task above Level 2 before any handler runs, and a plan artifact cannot lower a task below its classified level. Added the `docs/contracts/security/change-level.json` contract, engine/CLI/security regression tests, and a "Not yet enforced" section (`TM-GAP-01`..`TM-GAP-10`) in `docs/architecture/REMEDIATION_TRUST_MODEL.md`; corrected `docs/commands/plan.md` (only `--json` persists `.playbook/plan.json`) and `docs/contracts/verify-output.md` (failure count is the maximum across failure sources).

### WHY

- Makes the audit able to catch the drift it claims to guard (dropped `context` step, a doc that mislabels a command as canonical/compatibility/utility) and gives humans and agents deterministic metadata for which commands are planned-only or answer only a bounded set of questions, without changing existing command-truth entries.
- Keeps the product-truth packaging surfaces (what is canonical, compatibility-only, utility, planned or question-bounded) from drifting silently: these audit rules previously had no test coverage, so loosening or deleting them would not have failed CI.
- Removes the risk that verify, plan and analyze drift on which plugins and rules they load, while keeping the output-changing CLI/engine plugin reconciliation explicit and deferred instead of hidden.
- Records which features the merged slices actually finished, so the public board shows finished work as finished and keeps the open work (decisions, hosted surfaces, graph-backed impact analysis) visible without recasting partial work as done.
- Keeps the roadmap an honest source for the public project board: shipped features can no longer declare commands, contracts, docs or tests that do not exist, and the Windows test runs no longer fail on a path idiom.
- Keeps the committed fallback runtime in step with the source the CLI is built from, so a fresh clone and a built tree agree.
- Keeps the release-asset and pack-smoke gates runnable from any Windows shell and keeps the Windows launcher tests honest about `%ComSpec%`.
- Lets the Playbook roadmap goals pass the public project-board text screen so the delivery-system card can be published, and records the roadmap as current as of this change.
- Keeps the owner export and managed-docs gates portable across Git line-ending settings, matching the roadmap source-revision hash that already normalizes to LF.
- Lets Playbook and `_stack` enforce proof-backed completion for the ATLAS UI-governance lane without creating a second UI truth store.
- Keeps workflow-pack reuse explicit about the difference between canonical verification contracts and downstream compatibility projections.
- Establish consistent design primitives for deterministic automation and governance.
- Encourage storing compact invariant state and deriving redundant views/behavior on demand.
- Makes the remediation trust model's "Level 3 is never auto-applied" promise enforceable and machine-readable instead of documentation-only, and records the promises that are still unenforced as named gaps rather than implying they hold.
- Align Playbook workflow framing with triadic system structure.
- Keeps the engine package test run stable under full workspace and package-load execution: the same suite that passes alone previously failed `diffContext` with "Test timed out in 5000ms" when workers ran in parallel, because git- and temp-fixture tests take 3-20s under load. Tests and assertions are unchanged.

### WHAT

- Added Phase 7 Wave 2A additive outcome telemetry context fields (`task_profile_id`, `task_family`, `affected_surfaces`, `estimated_change_surface`, `actual_change_surface`, `files_changed_count`, `post_apply_verify_passed`, `post_apply_ci_passed`, `regression_categories`, `pattern_families_implicated`) plus deterministic normalization/rollups and safe degradation for partial or legacy records.
- Added Phase 7 Wave 1 deterministic learning-state snapshots (`learning-state-snapshot`) with required compact metrics (`first_pass_yield`, `retry_pressure`, `validation_load_ratio`, `route_efficiency_score`, `smallest_sufficient_route_score`, `pattern_family_effectiveness_score`, `portability_confidence`) derived from outcome telemetry, process telemetry, and optional task-execution-profile evidence.
- Added `pnpm playbook telemetry learning-state` inspection surface with JSON/text output and safe degradation when telemetry artifacts are partially or fully missing.
- Registered the additive `learning-state` contract in schema registries/contracts output and added deterministic fixture/test coverage for strong docs-only efficiency, weak contracts-schema retry pressure, high-validation engine scoring, low-confidence cross-repo pattern learning, and low-sample open-question scenarios.
- Implemented Phase 7 Wave 2B additive process telemetry enrichment with route/profile identifiers, selected rule-pack and validation fields, validation/planning/apply durations, intervention and over/under-validation signals, plus realized parallel-safety evidence and deterministic rollups.
- Implemented Phase 7 Wave 2C learning-state derivation upgrades to consume enriched outcome/process telemetry, refine router/orchestration metrics (`smallest_sufficient_route_score`, `route_efficiency_score`, `parallel_safety_realized`, `router_fit_score`, `reasoning_scope_efficiency`, `validation_cost_pressure`), and emit explicit low-signal open questions while preserving backward-compatible partial summaries.
- Strengthened `pnpm playbook apply --from-plan` plan loading to decode UTF-8 (with/without BOM) and UTF-16 (LE/BE BOM) artifacts, including conservative UTF-16 detection when shell redirection emits NUL-patterned output.
- Improved invalid plan JSON diagnostics to preserve file path context and provide actionable shell-encoding guidance when payload bytes suggest PowerShell-style encoding artifacts.
- Updated workflow docs with explicit PowerShell-safe plan capture examples and branch-local `node packages/cli/dist/main.js` commands for deterministic local validation.
- Added PR-based `playbook-demo` refresh automation via `scripts/demo-refresh.mjs` and `.github/workflows/demo-refresh.yml`, with allowlisted artifact staging and `PLAYBOOK_CLI_PATH` injection.
- Hardened `scripts/demo-refresh.mjs` for production use by detecting npm/pnpm/yarn refresh command runners from lockfiles, removing `bash -lc` execution in default paths, and adding explicit push-mode git identity + token-auth setup.
- Updated `.github/workflows/demo-refresh.yml` permissions and push-mode environment setup to support reliable branch push + PR create/update in `playbook-demo` while preserving dry-run defaults for schedule/push triggers.
- Normalized `.github/workflows/demo-integration.yml` to a dry-run integration check that reuses the new refresh orchestrator.
- Added companion integration expectations in `docs/integration/PLAYBOOK_DEMO_COMPANION_CHANGES.md` and roadmap anchoring for `PB-V1-DEMO-REFRESH-001`.
- Installed pnpm via `pnpm/action-setup@v4` (without unsupported cache inputs) and added manual pnpm store caching via `actions/cache@v4`.
- Removed legacy `.eslintignore` and rely on flat-config `ignores` in `eslint.config.cjs`.
- Added `pnpm.supportedArchitectures` in the root `package.json` to lock Linux x64 glibc Rollup optional native packages deterministically.
- Added a Linux-only Rollup native resolution sanity check in `.github/actions/playbook-ci/action.yml` before `pnpm verify`.
- Added a `pack:smoke` CI check that packs local tarballs and verifies install + `init`/`analyze`/`verify` against the packaged CLI artifact.
- Updated repository intelligence module discovery for modular-monolith repositories to index `src/features/*` child directories (for example `users`, `workouts`) as first-class modules while preserving workspace precedence and `src/*` fallback behavior.
- Strengthened `scripts/demo-validate.mjs` with explicit demo module-contract checks (`index`, `query modules`, and `explain workouts`) to catch feature-module indexing regressions early.

### WHY

- Preserves structural task context in outcome evidence so learning snapshots avoid false signals from decontextualized event counts.
- Establishes a compact, deterministic, reviewable learning layer between raw evidence and future routing/meta-evolution proposals while preserving proposal-only posture and preventing autonomous mutation from unsegmented telemetry.
- Reduces Goodhart-router risk by exposing explicit confidence/open-question summaries tied to sample size, coverage, and evidence completeness rather than raw log replay.
- Improves router-quality evaluation by making validation cost, intervention pressure, and realized parallel safety explicit evidence for learning-state analysis.
- Improves routing and orchestration learning quality by grounding compact metrics in richer observable execution evidence while keeping proposal-only posture and deterministic output ordering.
- Prevent Windows/PowerShell plan redirection encoding differences from breaking deterministic `apply --from-plan` workflows while keeping plan contract validation strict.
- Prevent CI/local failures caused by missing `@rollup/rollup-linux-x64-gnu` under frozen lockfile installs.
- Eliminate ESLint v9 flat-config warnings caused by `.eslintignore`.
- Make cross-repo demo refresh automation deterministic across local maintainer and GitHub Actions execution contexts.

## v0.1.1

### WHAT

- Added npm publishing support for Playbook packages under the `@zachariahredfield/*` scope, including the CLI package `@zachariahredfield/playbook`.
- Added a tag-triggered npm publish workflow at `.github/workflows/publish-npm.yml`.
- Added a reusable verify composite action at `.github/actions/verify/action.yml` and aligned `actions/verify/action.yml` to the scoped package.
- Updated README onboarding to a true 30-second `npx` path and added a copy/paste GitHub Action usage snippet.
- Added `docs/RELEASING.md` with release, tagging, and publish steps.

### WHY

- Make `npx @zachariahredfield/playbook ...` work out of the box.
- Provide a reliable, tag-based release path for npm publication.
- Give teams a polished GitHub Action integration path that works with published versions.
