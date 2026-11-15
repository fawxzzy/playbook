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

Open-item status (single source of truth; the rationale for each choice is in "Decisions" below, the contract is
`docs/contracts/PLUGIN_CONTRACT_V1.md`). Each item was originally left open because resolving it would change command
output or a public API; the Plugin Contract v1 slice closed all but three.

| Id | Original problem | Status | Resolution or remaining work |
|---|---|---|---|
| `OPEN-PLUGIN-SHAPE` | CLI plugin rules (`verify` predicate over a failure) and engine plugin rules (`check` producing failures) were different contracts, so a plugin was visible to one surface only. | CLOSED | The contract is the engine shape (`check(ctx) -> { failures }`) with optional guidance fields and a `contractVersion`. Legacy `verify({ failure }) -> boolean` plugins are adapted by `packages/engine/src/plugins/legacyPredicateShim.ts`, the only module that knows the legacy shape. |
| `OPEN-PLUGIN-DISCOVERY` | CLI discovered `playbook-plugin-*` dependencies; engine read `playbook.config.json` `plugins`. | CLOSED | Discovery is `playbook.config.json` `plugins`; `playbook-plugin-*` dependency discovery survives only inside the deprecated shim, with a once-per-process deprecation notice on stderr. |
| `OPEN-RULES-SURFACE` | `rules --json` listed only CLI core rules (for example `notes.missing`); engine and plugin rules never appeared. | CLOSED for listing | `rules --json` lists engine core rules without CLI guidance, v1 plugin rules and legacy plugin rules, each with an additive `source` field (`core`, `plugin`, `legacy-plugin`). The residual id-namespace split is tracked as `OPEN-RULE-ID-NAMESPACES`. |
| `OPEN-ANALYZE-PLUGINS` | CLI `analyze` did not load plugin detectors while `analyzeRepo`/`doctor` did. | CLOSED | The engine context-based `analyze` used by the CLI appends plugin detectors after the dependency-only core detectors through the unified registry; output for repositories without plugins is unchanged. |
| `OPEN-CORE-ANALYZE-ADAPTER` | The deprecated synchronous core `analyze` compatibility adapter still exists. | OPEN (on purpose) | Kept because the engine test suite compares against it; delete it in the same major as the legacy shim. |
| `OPEN-REPO-INDEX-RULES` | `repoIndexer.ts` (`detectRules`) listed `getCoreRules` ids only. | CLOSED | `repo-index.json` `rules` includes plugin rule ids (core ids unchanged, sorted, de-duplicated); a broken plugin falls back to the core ids instead of failing `index`. |
| `OPEN-RULE-ID-NAMESPACES` | CLI guidance rules (`notes.missing`, `notes.empty`) and engine rules (`requireNotesFileWhenGovernanceExists`) are separate id namespaces for the same failures. | OPEN | Resolve only with an additive alias map, never a rename (see Decision 3). |
| Legacy shim removal | The shim keeps old `playbook-plugin-*` plugins working. | OPEN (next major) | Tracked by the one-time deprecation notice (see Decision 10). |

Single-loader boundary (enforced by `packages/cli/src/lib/pluginContract.test.ts`): the CLI
reaches plugins only through `lib/loadVerifyRules.ts`, which only calls
`engine.loadRuleCatalog`; `verify`, `rules`, `apply`, `fix` and `status` import that module,
`analyze` calls the engine `analyze`, and the legacy shim is imported only by
`unifiedPluginRegistry.ts`.

## Decisions (2026-11-14, delegated by the owner; least privilege, deterministic, long-term)

Rule: one versioned plugin contract, one loader. Plugins are loaded only through
`packages/engine/src/plugins/unifiedPluginRegistry.ts`; the CLI never discovers, resolves or imports a plugin itself.

1. `OPEN-PLUGIN-SHAPE`: Decision: the engine shape (`check(ctx) -> { failures }` plus optional guidance) is the contract;
   the legacy `verify({ failure }) -> boolean` shape exists only inside the shim. Alternatives lose: keeping both shapes
   leaves a plugin visible to one surface only; making the CLI predicate the contract cannot produce failures, so verify and
   plan could never run plugin rules.
2. `OPEN-PLUGIN-DISCOVERY`: Decision: discovery is explicit (`playbook.config.json` `plugins`); `playbook-plugin-*`
   dependency scanning stays only in the deprecated shim. Alternatives lose: naming-convention discovery loads code nobody
   listed (ambient authority) and makes output depend on what happens to be installed.
3. `OPEN-RULES-SURFACE`: Decision: `rules --json` lists every rule with an additive `source`; rule ids are not renamed.
   Alternative loses: renaming CLI guidance ids to engine ids breaks the `rules`/`verify` JSON contract for no new capability.
   `OPEN-RULE-ID-NAMESPACES` stays open; resolve it only with an additive alias map, never a rename.
4. `OPEN-ANALYZE-PLUGINS`: Decision: CLI analyze appends plugin detectors after the dependency-only core detectors through
   the unified registry. Alternative loses: routing through `analyzeRepo` changes `detectorsRun`/`detected` for repositories
   without plugins.
5. `OPEN-CORE-ANALYZE-ADAPTER`: Decision: remains OPEN on purpose. Keep the deprecated synchronous core adapter until the
   engine tests stop using it as their parity oracle, then delete it in the same major as the legacy shim. Alternatives lose:
   deleting it now removes the only independent oracle for analyze output; keeping it indefinitely leaves two analyzers.
6. `OPEN-REPO-INDEX-RULES`: Decision: `repo-index.json` `rules` includes plugin rule ids (sorted, de-duplicated) and falls
   back to core ids when a plugin is broken. Alternative loses: failing `index` on a broken plugin turns a read-only index
   into a verify gate.
7. Plugin identity (this slice): a plugin specifier is a package name or a `./` path whose real path stays inside the
   repository; everything else is rejected before resolution, and the plugin shape is validated before registration.
   Alternatives lose: trusting the config string lets `../`, absolute paths and links execute code outside the repository
   from a one-line config edit; a sandbox is not available in-process and would imply a guarantee the loader cannot give.
8. Privilege: plugins stay report-only; plugin fix handlers keep the change-level-2 floor under the existing apply ceiling,
   which this contract never raises. Alternative loses: letting a manifest declare its own level is self-granted authority.
9. Unsupported `contractVersion`: skip with a notice (never half-load). Alternative loses: throwing would break a whole
   repository because one plugin targets a newer Playbook.
10. Legacy shim removal: deferred to the next major, tracked by the one-time deprecation notice. Alternative loses: removing
    it now breaks every existing `playbook-plugin-*` consumer.

Evidence: `packages/engine/test/pluginIdentityV1.test.ts` (specifier, identity and shape rules, each proven by mutation) and
`packages/engine/test/pluginContractV1.test.ts`. Card `PB-V05-PACKAGE-BOUNDARIES-001` stays `implemented-hardening`:
`OPEN-CORE-ANALYZE-ADAPTER`, `OPEN-RULE-ID-NAMESPACES` and the shim removal remain.
