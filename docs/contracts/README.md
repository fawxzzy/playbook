# Contracts index

Versioned artifact and command contracts. Machine truth for commands is [command-truth.json](./command-truth.json) (generated; do not hand-edit). The schema registry is [CONTRACT_REGISTRY_V1.md](./CONTRACT_REGISTRY_V1.md). Contract docs describe shipped behavior unless they say "draft" or "design, not yet implemented".

## Commands and execution

- [Command contracts (v1 baseline)](./COMMAND_CONTRACTS_V1.md), [Verify output](./verify-output.md), [Execution plan](./EXECUTION_PLAN.md)
- [Plan/apply override contract](./PLAN_APPLY_OVERRIDE_CONTRACT.md) (change-level ceiling and the explicit Level 3 override)
- [Task execution profile](./TASK_EXECUTION_PROFILE.md), [Local verification receipt](./LOCAL_VERIFICATION_RECEIPT_CONTRACT.md)
- [Plugin contract v1](./PLUGIN_CONTRACT_V1.md), [Failure intelligence](./FAILURE_INTELLIGENCE_CONTRACT.md) ([taxonomy schema](./FAILURE_TAXONOMY_SCHEMA.json))
- [Playbook contract](./PLAYBOOK-CONTRACT.md)

## Security gates (schemas in `security/`)

`apply-scope`, `change-level`, `plan-determinism`, `policy-gate`, `repo-boundary` and `secret-redaction` JSON schemas.

## Repository intelligence and memory

- [Repository graph](./repository-graph-contract.md), [Architecture intelligence graph](./ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md)
- [Memory events](./REPOSITORY_MEMORY_EVENT_CONTRACT.md), [Memory knowledge](./REPOSITORY_MEMORY_KNOWLEDGE_CONTRACT.md), [Artifact evolution policy](./ARTIFACT_EVOLUTION_POLICY.md)

## Learning, patterns and telemetry

- [Pattern candidates](./PATTERN_CANDIDATES.md), [Pattern graph](./PATTERN_GRAPH.md), [Pattern outcomes](./PATTERN_OUTCOMES.md), [Pattern family discovery](./PATTERN_FAMILY_DISCOVERY.md), [Pattern portability](./PATTERN_PORTABILITY.md), [Cross-repo pattern candidates](./CROSS_REPO_PATTERN_CANDIDATES.md)
- [Learning state](./LEARNING_STATE.md), [Outcome telemetry](./OUTCOME_TELEMETRY.md), [Process telemetry](./PROCESS_TELEMETRY.md), [RunCycle](./RUN_CYCLE.md), [State space](./STATE_SPACE.md), [Zettelkasten](./ZETTELKASTEN.md)
- [Verta derivative pattern pack](./VERTA_DERIVATIVE_PATTERN_PACK.md), [Verta promotion receipt](./VERTA_DERIVATIVE_PATTERN_PROMOTION_RECEIPT.md)

## Workflow packs and registries

- [Workflow promotion](./WORKFLOW_PROMOTION_CONTRACT.md), [Workflow pack reuse](./WORKFLOW_PACK_REUSE_CONTRACT.md), [Event contract workflow consumers](./EVENT_CONTRACT_WORKFLOW_CONSUMERS.md)
- [Environment bridge](./PLAYBOOK_WORKFLOW_PACK_ENVIRONMENT_BRIDGE_CONTRACT.md) and [bridge executor](./PLAYBOOK_WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_CONTRACT.md)
- [Golden-path template registry](./PLAYBOOK_GOLDEN_PATH_TEMPLATE_REGISTRY_CONTRACT.md), [Repo scorecard](./PLAYBOOK_REPO_SCORECARD_CONTRACT.md)
- [Project-board owner export](./PROJECT_BOARD_OWNER_EXPORT.md)

## Draft (not implemented)

- [Convergence scan contract](./PLAYBOOK_CONVERGENCE_SCAN_CONTRACT_DRAFT.md): draft only, no shipped code
