# Docs Archive

The `docs/archive/` directory stores historical documentation snapshots that are retained for reference.

Archived documents are historical/reference-only and are not active sources of product truth.

## Current canonical product docs

Use these documents as active product truth:

- [README.md](../../README.md)
- [AGENTS.md](../../AGENTS.md)
- [docs/index.md](../index.md)
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md)
- [docs/commands/README.md](../commands/README.md)
- [docs/PLAYBOOK_PRODUCT_ROADMAP.md](../PLAYBOOK_PRODUCT_ROADMAP.md)
- [docs/PLAYBOOK_BUSINESS_STRATEGY.md](../PLAYBOOK_BUSINESS_STRATEGY.md)
- [docs/CONSUMER_INTEGRATION_CONTRACT.md](../CONSUMER_INTEGRATION_CONTRACT.md)
- [docs/roadmap/README.md](../roadmap/README.md)

## Naming convention

Archive files should follow `BASENAME_2026.md` naming (for example, `OVERVIEW_2026.md`).

## Compatibility stubs

Compatibility stub documents may remain at original paths so inbound links continue to resolve while redirecting readers to canonical docs.

## Archived in the 2026 docs reorganization

Moved here from active locations; content is unchanged apart from archive-relative links. None of these are product truth.

| Archived file | Former path | Why |
| --- | --- | --- |
| [PLAYBOOK_CONTRIBUTION_MODEL_2026.md](./PLAYBOOK_CONTRIBUTION_MODEL_2026.md) | docs/PLAYBOOK_CONTRIBUTION_MODEL.md | aspirational essay; the operating guide is [docs/contributing.md](../contributing.md) |
| [REPO_SNAPSHOT_2026-03.md](./REPO_SNAPSHOT_2026-03.md) | docs/REPO_SNAPSHOT.md | static tree snapshot from 2026-03 |
| [STACK_PR_MERGE_ORDER_2026-03.md](./STACK_PR_MERGE_ORDER_2026-03.md) | docs/STACK_PR_MERGE_ORDER.md | historical PR merge order |
| [PLATFORM_GUARDRAIL_AUDIT_2026-03.md](./PLATFORM_GUARDRAIL_AUDIT_2026-03.md) | docs/architecture/PLATFORM_GUARDRAIL_AUDIT.md | dated audit snapshot |
| [PHASE_21_AUTONOMOUS_MAINTENANCE_PROPOSAL_ONLY_2026-04.md](./PHASE_21_AUTONOMOUS_MAINTENANCE_PROPOSAL_ONLY_2026-04.md) | docs/architecture/PHASE_21_AUTONOMOUS_MAINTENANCE_PROPOSAL_ONLY.md | dated proposal, superseded |
| [COMMAND_SYSTEM_ANALYSIS_2026-03.md](./COMMAND_SYSTEM_ANALYSIS_2026-03.md) | docs/architecture/COMMAND_SYSTEM_ANALYSIS.md | dated analysis; superseded by [COMMAND_GRAPH](../architecture/COMMAND_GRAPH.md) and `docs/contracts/command-truth.json` |
| [reports/cycle-telemetry-validation_2026-03.md](./reports/cycle-telemetry-validation_2026-03.md) | docs/reports/cycle-telemetry-validation.md | one-time validation report |
| [pilots/FAWXZZY_FITNESS_PILOT_2026.md](./pilots/FAWXZZY_FITNESS_PILOT_2026.md) | docs/pilots/FAWXZZY_FITNESS_PILOT.md | pilot plan; the retrospective stays at [docs/pilots/](../pilots/FAWXZZY_FITNESS_PILOT_RETROSPECTIVE.md) |
| [patterns/discord-verification-gates_2026.md](./patterns/discord-verification-gates_2026.md) | docs/PATTERNS/discord-verification-gates.md | out of product scope |
| [patterns/discord-verification-gate.prompt_2026.md](./patterns/discord-verification-gate.prompt_2026.md) | templates/codex/discord-verification-gate.prompt.md | companion prompt for the Discord pattern |
| [playbook-sevenfold-plus/](./playbook-sevenfold-plus/) | playbook/{engine,generators,ontologies,patterns}/ | Sevenfold Plus worldbuilding ontology, unrelated to the CLI |

Subdirectory archives (`reports/`, `pilots/`, `patterns/`, `playbook-sevenfold-plus/`) are exempt from the top-level `BASENAME_YYYY[-MM].md` naming check.
