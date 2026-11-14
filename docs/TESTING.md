# Testing

## 1) Testing philosophy

Testing is part of Playbook's product contract:

- New commands should ship with tests.
- Coverage must validate behavior and CLI-facing contracts.
- Determinism and JSON stability are first-class test targets.

## 2) Test layers

### Unit tests

Focus:

- Engine logic.
- Rule behavior.
- Deterministic task generation.

### CLI tests

Focus:

- Text output rendering.
- Exit behavior.
- JSON output contract shape.

### Integration tests

Focus:

- `verify` → `plan` pipeline behavior.
- Rule registry loading and execution.

### Smoke tests

Focus:

- Packed/installed CLI execution (`pnpm pack:smoke`: packs the workspace tarballs, installs them with `npm install` into a temp project, then runs `init`, the bootstrap and intelligence commands, `verify`, `plan` and `pilot` through the installed bin).
- Built-CLI end-to-end runs against a temp project (`pnpm smoke` and `pnpm smoke:ci` run `scripts/smoke-test.mjs`; `pnpm test:cli` runs `scripts/cli-smoke.mjs`). These exercise `packages/cli/dist/main.js`, not a packed install.
- End-to-end confidence that Playbook works as a package, not only from source.

## 3) JSON contract stability

JSON output is a public interface. Its shape should remain stable across versions so CI systems, AI agents, and automation pipelines can safely consume results.

Committed CLI contract snapshots live in `tests/contracts/*.snapshot.json` and are asserted by `packages/cli/test/cliContracts.test.ts`. `pnpm contracts:check` regenerates them from the built CLI into a temp directory and fails when they differ from the committed copies. After confirming the change is intentional, refresh them with `pnpm test:update-snapshots` (it uses the built CLI, so run `pnpm -r build` first).

## 4) CI expectations

Typical local checks:

- `pnpm build`
- `pnpm test`: runs a bootstrap preflight (`node scripts/assert-esbuild.mjs`) so missing esbuild platform binaries fail fast with a deterministic message, then `pnpm contracts:check`, the root script tests (`node --test test/scripts/*.test.mjs`), and `pnpm -r test` for every package.
- `pnpm lint` (eslint, zero warnings allowed)
- `pnpm check:tests`: fails when a newly added command module (`packages/cli/src/commands/*.ts` exporting a `run*` function) or verify rule has no matching test file.
- `pnpm smoke:ci` (build plus `scripts/smoke-test.mjs`)

The repository's full local gate is `pnpm verify:local` (lint, `check:tests`, build, `check:cli-wrapper-runtime`, test, `smoke:ci`, `agents:update` and `agents:check`, `docs audit --ci`, and the roadmap contract validation). The lighter `pnpm verify` runs `pnpm lint && pnpm check:tests && pnpm test && pnpm smoke:ci`.

`pnpm test -- <name>` forwards the arguments to the `packages/cli` vitest run, except for the single words `ask`, `ai-contract`, `schema`, `doctor`, `policy`, `runtime`, `scheduler` and `agent`, which run a fixed built-CLI smoke command instead (`pnpm test:targeted` runs all of them).

What CI runs: `.github/workflows/ci.yml` (jobs `ci` and `demo-validate`) and `.github/workflows/playbook.yml` (job `verify`) both use the `.github/actions/playbook-ci` composite action. Its full `ci` path runs `pnpm -r build`, `pnpm contracts:check`, `pnpm check:cli-wrapper-runtime`, release-drift and preflight verify checks (release-governed repos only), `pnpm test` (with `PLAYBOOK_SKIP_CONTRACTS_CHECK=1`, because the contract check already ran), `pnpm test:targeted`, `verify --json`, the roadmap contract validator and `docs audit --ci --json`. `.github/workflows/security.yml` (job `security-program`) runs `pnpm test:security`. CI does not run `pnpm lint`, `pnpm check:tests`, `pnpm smoke:ci` or `pnpm pack:smoke`; run `pnpm verify` or `pnpm verify:local` locally for those.

CI failures should block merges when core behavior or contracts break.

## 5) Pattern: CI test note clarity

Test result notes should clearly separate environment failures from code regressions.

Use consistent phrasing that makes failures scannable:

1. command
2. result
3. cause
4. scope

Example:

```text
⚠️ pnpm pack:smoke
Result: Failed
Cause: Network/registry restriction in environment (npm 403)
Scope: Not related to this change
```

## 6) Network-restricted failure mode

In network-restricted CI environments, dependency install may fail with npm 403 errors. This can cascade into `pnpm pack:smoke` failures, including fallback tar extraction errors, even when packaging logic is correct.

Preferred warning phrasing for this case:

```text
⚠️ pnpm pack:smoke (failed in this environment due to network/registry restrictions causing npm 403 during dependency install and fallback tar extraction).
```

## 7) Engine test timeouts and heavy fixtures

Many `packages/engine` tests create real git repositories and temp-directory fixtures (`git init`/`commit`, release governance, changelog collection, memory/doctor diagnostics). Single tests in `releaseVersionGovernance`, `gitCollector` and `artifactHygiene` take roughly 3-20s when workers run in parallel or other packages are building, which is well past vitest's 5s default.

Conventions:

- `packages/engine/vitest.config.mjs` sets `testTimeout` and `hookTimeout` to 30s for the whole engine package. Do not add `it(..., 5000)`-style overrides or skip tests to hide a timeout; fix the fixture or raise the ceiling in that one config.
- `packages/engine/scripts/run-tests.mjs` additionally runs files serially (`--fileParallelism=false --pool=threads`) on Windows. That is a Windows-specific worker-teardown mitigation; the config timeout is what protects parallel runs on every platform.
- Per-package runners: `packages/cli/scripts/run-tests.mjs` passes `--testTimeout=20000` to vitest and runs `src/commands/observer.test.ts` separately (after a build, via `scripts/run-observer-tests.mjs`) when no file filter is given; `packages/core` and `packages/node` run `vitest run --passWithNoTests`; `packages/cli-wrapper` has a no-op test script.
- Heavy fixtures should create their own `fs.mkdtempSync(path.join(os.tmpdir(), ...))` repo, never share one across tests, and set `user.email`/`user.name` locally rather than relying on global git config.
- A test that fails with `Test timed out in <N>ms` under `pnpm -C packages/engine test` is a regression in fixture cost (or a real hang), not a reason to weaken the assertion.
