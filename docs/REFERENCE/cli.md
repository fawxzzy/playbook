# CLI Reference

This page is a thin entrypoint. The authoritative command inventory and command-state snapshot lives in [docs/commands/README.md](../commands/README.md).

## Product-facing command categories

Playbook command surfaces are organized as:

- **Core runtime**: `analyze`, `verify`, `plan`, `apply`
- **Repository tools**: diagnostics, docs/architecture/governance support commands
- **Repository intelligence**: `index`, `query`, `deps`, `ask`, `explain`
- **AI bootstrap context**: `ai-context`, `ai-contract`, `context`
- **Utility flows**: onboarding, initialization, upgrades, and session utilities

For canonical serious-user operation, use:

`ai-context -> ai-contract -> context -> index/query/explain/ask --repo-context -> verify -> plan -> apply -> verify`

`analyze` remains available as a compatibility-oriented/lightweight entrypoint.

## Query-domain note

Structured domains such as `risk`, `impact`, `docs-coverage`, `rule-owners`, and `test-hotspots` are query surfaces/subcommands (for example via `pnpm playbook query ...`), not standalone top-level commands.

## Global options (all top-level commands)

- `--repo <path>`: target repository root for command execution (default: the current directory)
- `--ci`: deterministic CI mode with minimized output (quiet unless errors)
- `--format <text|json>`: explicit output format (`verify` also accepts `sarif`)
- `--json`: alias for `--format=json`
- `--out <path>`: write JSON output artifacts (raw SARIF for `verify --format sarif`)
- `--quiet`: suppress success output in text mode
- `--explain`: include rationale/remediation context in text mode where supported
- `--policy`: enable policy enforcement mode for `verify`
- `--help`, `--version`: print help or the version and exit `0` (known issue: `--version` prints a hard-coded `0.1.2`, not the package version; read the package version from `packages/cli/package.json`)

Exit codes are documented in [exit-codes.md](./exit-codes.md).


## Runtime observability contract

Every top-level Playbook command except the report-only `learn doctrine` emits deterministic runtime observability artifacts under the target repository:

- `.playbook/runtime/current/coverage.json`
- `.playbook/runtime/current/telemetry.json`
- `.playbook/runtime/current/ignore-recommendations.json`
- `.playbook/runtime/cycles/<cycle_id>/manifest.json` (each cycle directory also holds `coverage.json`, `telemetry.json` and `ignore-recommendations.json`)
- `.playbook/runtime/history/command-stats.json`
- `.playbook/runtime/history/coverage-trend.json`
- `.playbook/runtime/history/analyzer-version-history.json`

This contract intentionally optimizes for measurable coverage accounting (analyzable, scanned, skipped, unsupported, unknown) rather than implied completeness claims. Coverage artifacts separate **observations** (measured facts) from **interpretations** (derived inferences) so analyzer upgrades can be distinguished from repository changes.

Coverage artifacts expose explicit counts (`total_files_seen`, `eligible_files`, `scanned_files`, `ignored_files`, `unsupported_files`, `binary_files`, `oversized_files`, `parse_failed_files`) and explicit formulas for:

- `eligible_scan_coverage_score`
- `repo_visibility_score`
- `blind_spot_ratio`

Telemetry artifacts summarize optimization-relevant internals (phase counts, artifact reads/writes, fallback counts, and deterministic expensive-path categories such as `vcs-internal`, `build-cache`, `generated-report`, and `temporary-file`) without emitting raw event firehoses.

## CLI design principles

Playbook CLI commands are designed for both humans and automation:

- Readable text output for local developer workflows, machine-readable JSON output (`--json`) for CI and tooling.
- Deterministic output wherever possible: findings are sorted before downstream task generation, stable task fields are preserved, and nullable or optional fields are normalized for predictable parsing.
- JSON output is a public automation contract (stable shape for pipelines and AI agents). The typical envelope starts with `schemaVersion` and `command`, followed by command-specific fields; the per-command shapes are in [docs/contracts/command-truth.json](../contracts/command-truth.json), [docs/contracts/COMMAND_CONTRACTS_V1.md](../contracts/COMMAND_CONTRACTS_V1.md) and the command docs.
- `packages/cli` owns argument parsing, command dispatch, rendering and exit behavior; `packages/engine` owns analysis, verification, planning and remediation execution. Command files stay thin wrappers around engine functionality.

## Remediation command roles

- `verify`: detect policy/governance issues.
- `plan`: generate deterministic remediation intent (`tasks`) for review or automation.
- `apply`: execute deterministic plan tasks, especially via serialized artifacts (`--from-plan`); the Level 2 ceiling and the explicit Level 3 override are described in [PLAN_APPLY_OVERRIDE_CONTRACT.md](../contracts/PLAN_APPLY_OVERRIDE_CONTRACT.md).
- `fix`: convenience/direct remediation for local/manual workflows; overlaps with `apply` intent but keeps operator-friendly flags like `--dry-run`, `--yes` and `--only`.

For CI and agent workflows, prefer `verify -> plan -> apply -> verify` because the plan artifact is reviewable before execution.

## Diagnosis and PR intelligence

- `doctor` aggregates existing analyzers (verify findings, query risk, docs audit, index and memory diagnostics) into one health report; envelope, failure domains and exit codes are in [doctor.md](../commands/doctor.md).
- `analyze-pr` is the local-first structured PR analysis command (git diff plus `.playbook/repo-index.json`); see [analyze-pr.md](../commands/analyze-pr.md). Use `ask --diff-context` for conversational answers and `analyze-pr` for structured review artifacts.
