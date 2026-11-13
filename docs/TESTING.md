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

- Packed/installed CLI execution.
- End-to-end confidence that Playbook works as a package, not only from source.

## 3) JSON contract stability

JSON output is a public interface. Its shape should remain stable across versions so CI systems, AI agents, and automation pipelines can safely consume results.

## 4) CI expectations

Typical checks:

- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm test` now runs a bootstrap preflight (`node scripts/assert-esbuild.mjs`) so missing esbuild platform binaries fail fast with a deterministic message before suite execution.

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
- Heavy fixtures should create their own `fs.mkdtempSync(path.join(os.tmpdir(), ...))` repo, never share one across tests, and set `user.email`/`user.name` locally rather than relying on global git config.
- A test that fails with `Test timed out in <N>ms` under `pnpm -C packages/engine test` is a regression in fixture cost (or a real hang), not a reason to weaken the assertion.
