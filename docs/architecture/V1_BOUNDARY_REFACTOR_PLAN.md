# V1 Boundary Refactor Plan

> Status (2026-11-14): this started as the plan; the analyze ownership slice and Plugin Contract v1 shipped under `PB-V05-PACKAGE-BOUNDARIES-001` (`implemented-hardening` in `docs/roadmap/ROADMAP.json`). The "target", "action items" and "implementation proposal" sections are the original plan; the status sections further down are current.

## Objective

Eliminate boundary drift between CLI, core, and engine by making CLI commands thin wrappers around one canonical engine implementation per command.

## Canonical ownership (target)

| Command surface | Canonical implementation package | Notes |
| --- | --- | --- |
| `index`, `query`, `deps`, `ask`, `explain`, `graph` | `@zachariahredfield/playbook-engine` | Already mostly aligned. |
| `verify`, `plan`, `apply`, `rules` | `@zachariahredfield/playbook-engine` | Keep deterministic remediation flow in one layer. |
| `analyze` | `@zachariahredfield/playbook-engine` | **Refactor required** to retire duplicated analyze path in core. |
| formatting and output adapters | `@fawxzzy/playbook` (CLI package) | Parse args, print deterministic envelopes, no domain logic. |

## Module boundary corrections (v1 action items)

1. Move `analyze` domain behavior to engine and keep `packages/cli/src/commands/analyze.ts` as wiring only.
2. Define a single plugin registry contract consumed by both verify and explain/rules surfaces.
3. Route SCM base and merge-base resolution through one shared context module used by `verify`, `ask --diff-context`, and `analyze-pr`.
4. Keep JSON schema contracts in sync with command contract docs before changing command output fields.

## File-level implementation proposal

- Add `packages/engine/src/analyze/*` as canonical analyzer pipeline.
- Reduce `packages/core/src/analyze*` to compatibility wrapper (temporary) then remove.
- Add unified plugin adapter at `packages/engine/src/plugins/unifiedPluginRegistry.ts`.
- Update CLI command files to call engine entry points only.

## Failure modes this plan prevents

- Core/engine behavior drift for the same command.
- Plugin bifurcation where execution and explainability see different rule sets.
- SCM normalization drift across diff-based commands.

## Analyze migration status (2026-10-16)

The CLI now calls the engine's context-based `analyze` entrypoint. Recommendation,
summary and architecture-marker policy is shared as pure functions in core;
the synchronous core API remains a deprecated compatibility adapter, preserving
the acyclic core <- engine <- CLI package graph. Engine `analyzeRepo` retains
its filesystem/plugin detector contract and uses the same policy.

This is the analyze ownership slice of PB-V05. Unified plugin loading across
verify/rules/explain and retirement of the legacy core adapter remain open.
CLI dependency-only detection and engine filesystem/plugin detection retain
their previous behavior pending that separately parity-checked migration.

## Plugin loading unification status (PB-V05-PACKAGE-BOUNDARIES-001)

Audit facts (paths at `origin/main` `b2a9003e` before this slice):

- Engine plugin loading is `packages/engine/src/plugins/loadPlugins.ts:11` (reads
  `playbook.config.json` `plugins`, `require`s each from the repo root, registers
  `PlaybookPlugin` rules with `check(ctx) -> { failures }` and `StackDetector`s).
- Three engine surfaces each composed the same `resetPluginRegistry` +
  register-core + `loadPlugins` sequence inline: `verify/index.ts:51-53`
  (`verifyRepo`), `execution/index.ts:62-64` (`runRuleExecution`, used by
  plan/apply), `analyze/index.ts:57-59` (`analyzeRepo`, used by `doctor`).
- CLI explainability/policy loader `packages/cli/src/lib/loadVerifyRules.ts` is a
  second, independent plugin path: it discovers plugins from `package.json`
  dependency names matching `playbook-plugin-*` (`:47-69`), imports
  `node_modules/<name>/index.js` (`:91-97`) and expects a different rule shape,
  `verify(ctx: { failure }) -> boolean` (`:31`, `:72-79`). It is used by CLI
  `verify` (`commands/verify.ts:323`), `rules` (`commands/rules.ts:52`), `apply`,
  `fix` and `status`.
- CLI `analyze` (`commands/analyze.ts:48-52`) calls the context-based engine
  `analyze`, which uses a dependency-only detector set and loads no plugins;
  CLI analyze guidance comes from the static `coreAnalyzeRules`
  (`lib/loadAnalyzeRules.ts:16-18`), which never sees plugins.
- `packages/cli-wrapper` is a launcher only (`bin/playbook.js` spawns
  `runtime/main.js`); it holds no command logic or plugin loading.

Unified in this slice (behavior-preserving, no output or public API change):

- Added `packages/engine/src/plugins/unifiedPluginRegistry.ts`
  (`loadRuleRegistry`, `loadDetectorRegistry`). `verifyRepo`, `runRuleExecution`
  and `analyzeRepo` now obtain their rules/detectors only through it.
  `packages/engine/test/pluginLoadingPath.test.ts` proves all three see the same
  configured plugin and fails if any engine module other than `plugins/*`
  imports `loadPlugins`/`pluginRegistry` directly.

Open items (would change command output or public API; intentionally not done):

1. `OPEN-PLUGIN-SHAPE`: CLI plugin rules (`verify` predicate over a failure) and
   engine plugin rules (`check` producing failures) are different contracts. A
   plugin written for one is invisible to the other. Resolving it needs a
   versioned plugin contract and migration for existing plugins.
2. `OPEN-PLUGIN-DISCOVERY`: CLI discovers `playbook-plugin-*` package
   dependencies; engine reads `playbook.config.json` `plugins`. Aligning changes
   which plugins load, and therefore `rules --json` and `verify` output, per repo.
3. `OPEN-RULES-SURFACE`: `rules --json` lists CLI core rules (for example
   `notes.missing`, `notes.empty`) whose ids differ from engine core rule ids
   (for example `requireNotesFileWhenGovernanceExists`); engine-registered rules
   and plugin rules never appear. Changing it changes the `rules` JSON contract.
4. `OPEN-ANALYZE-PLUGINS`: CLI `analyze` does not load plugin detectors while
   `analyzeRepo`/`doctor` do. Routing CLI analyze through `analyzeRepo` changes
   `detectorsRun`/`detected` output and needs its own parity check.
5. `OPEN-CORE-ANALYZE-ADAPTER`: retire the deprecated synchronous core `analyze`
   compatibility adapter (carried over from the 2026-10-16 status above).
6. `OPEN-REPO-INDEX-RULES`: `engine/src/indexer/repoIndexer.ts` (`detectRules`)
   lists `getCoreRules` ids only, without plugin rules; changing it alters the
   `repo-index.json` contract.

Plugin Contract v1 slice (`docs/contracts/PLUGIN_CONTRACT_V1.md`) - status of the items above:

1. `OPEN-PLUGIN-SHAPE`: CLOSED (implemented). The contract is the engine shape
   (`check(ctx) -> { failures }`) with optional guidance fields and a `contractVersion`.
   Legacy `verify({ failure }) -> boolean` plugins are adapted by
   `packages/engine/src/plugins/legacyPredicateShim.ts` (the only module that knows the
   legacy shape).
2. `OPEN-PLUGIN-DISCOVERY`: CLOSED (implemented). Discovery is `playbook.config.json`
   `plugins`; `playbook-plugin-*` dependency discovery survives only inside the
   deprecated shim, with a once-per-process deprecation notice on stderr.
3. `OPEN-RULES-SURFACE`: CLOSED for listing (implemented). `rules --json` now lists engine
   core rules without CLI guidance, v1 plugin rules and legacy plugin rules, each with an
   additive `source` field (`core` | `plugin` | `legacy-plugin`). Residual, tracked as
   `OPEN-RULE-ID-NAMESPACES`: CLI guidance rules (`notes.missing`, `notes.empty`) and engine
   rules (`requireNotesFileWhenGovernanceExists`) are still separate id namespaces that
   explain the same failures; merging them is a rule-id rename and was not done.
4. `OPEN-ANALYZE-PLUGINS`: CLOSED (implemented). The engine context-based `analyze` used by
   the CLI appends plugin detectors after the dependency-only core detectors through the
   unified registry; output for repositories without plugins is unchanged.
5. `OPEN-CORE-ANALYZE-ADAPTER`: STILL OPEN. Not touched by this slice: the deprecated
   synchronous core `analyze` compatibility adapter remains because the engine test suite
   still compares against it.
6. `OPEN-REPO-INDEX-RULES`: CLOSED (implemented). `repo-index.json` `rules` includes plugin
   rule ids (core ids unchanged, sorted, de-duplicated); a broken plugin falls back to the
   core ids instead of failing `index`.

Still open after this slice: `OPEN-CORE-ANALYZE-ADAPTER`, `OPEN-RULE-ID-NAMESPACES`, and
removal of the legacy shim itself (needs a major release; tracked by the deprecation notice).

Single-loader boundary (enforced by `packages/cli/src/lib/pluginContract.test.ts`): the CLI
reaches plugins only through `lib/loadVerifyRules.ts`, which only calls
`engine.loadRuleCatalog`; `verify`, `rules`, `apply`, `fix` and `status` import that module,
`analyze` calls the engine `analyze`, and the legacy shim is imported only by
`unifiedPluginRegistry.ts`.
