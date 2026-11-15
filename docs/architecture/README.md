# Architecture index

Specs, models and design notes that sit under [docs/ARCHITECTURE.md](../ARCHITECTURE.md) (the current runtime architecture). Per-command truth lives in [docs/commands/](../commands/README.md); artifact contracts in [docs/contracts/](../contracts/README.md). Parked theory notes live in [docs/research/theory/](../research/theory/README.md).

## Core runtime and boundaries

- [Overview (tightening)](./overview.md), [V1 boundary refactor plan](./V1_BOUNDARY_REFACTOR_PLAN.md), [Command graph](./COMMAND_GRAPH.md)
- [Control loop and layer ownership](./CONTROL_LOOP_AND_LAYER_OWNERSHIP.md), [AI vs deterministic boundary](./AI_DETERMINISM_BOUNDARY.md), [Remediation trust model](./REMEDIATION_TRUST_MODEL.md)
- [Ecosystem adapters](./ECOSYSTEM_ADAPTERS.md), [SCM context layer](./SCM_CONTEXT_LAYER.md), [Context efficiency strategy](./CONTEXT_EFFICIENCY_STRATEGY.md)
- [Documentation revision protocol](./PLAYBOOK_DOCUMENTATION_REVISION_PROTOCOL.md), [Constraint-driven architecture rubric](./PLAYBOOK_CONSTRAINT_DRIVEN_ARCHITECTURE_RUBRIC.md), [Final architecture map and dependency index](./PLAYBOOK_FINAL_ARCHITECTURE_MAP_AND_CANONICAL_DEPENDENCY_INDEX.md)
- [Local-first workflow model](./PLAYBOOK_LOCAL_FIRST_WORKFLOW_MODEL.md), [PR review loop](./PLAYBOOK_PR_REVIEW_LOOP_ARCHITECTURE.md)

## Repository intelligence

- [Architecture intelligence graph](./ARCHITECTURE_INTELLIGENCE_GRAPH.md), [Role inference](./ROLE_INFERENCE.md), [Structural graph and memory integration](./STRUCTURAL_GRAPH_AND_MEMORY_INTEGRATION_V1.md)

## Memory and knowledge

- [Repository memory model](./REPOSITORY_MEMORY_MODEL.md), [Repository memory system v1 (includes events and replay/promotion artifacts)](./REPOSITORY_MEMORY_SYSTEM_V1.md), [Graph memory](./GRAPH_MEMORY.md)
- [Replay, consolidation and promotion v1](./REPLAY_CONSOLIDATION_AND_PROMOTION_V1.md), [Knowledge compaction](./KNOWLEDGE_COMPACTION_PHASE.md), [Pattern compaction](./pattern_compaction.md)
- [Knowledge persistence layer](./PLAYBOOK_KNOWLEDGE_PERSISTENCE_LAYER.md), [Knowledge query and inspection surfaces](./PLAYBOOK_KNOWLEDGE_QUERY_AND_INSPECTION_SURFACES.md), [Longitudinal state and promotion](./PLAYBOOK_REPO_LONGITUDINAL_STATE_AND_KNOWLEDGE_PROMOTION.md), [Session evidence](./PLAYBOOK_SESSION_EVIDENCE_ARCHITECTURE.md)

## Learning and patterns

- [Pattern engine](./PATTERN_ENGINE.md), [Outcome learning and policy improvement v1](./OUTCOME_LEARNING_AND_POLICY_IMPROVEMENT_V1.md), [Policy improvement canonical contract](./POLICY_IMPROVEMENT_CANONICAL_CONTRACT.md)
- [Repository learning loop expansion](./PLAYBOOK_REPOSITORY_LEARNING_LOOP_EXPANSION.md), [Outcome feedback and runtime learning](./PLAYBOOK_OUTCOME_FEEDBACK_AND_AUTOMATION_RUNTIME_LEARNING.md), [Governed cross-repo pattern promotion](./PLAYBOOK_GOVERNED_CROSS_REPO_PATTERN_PROMOTION_AND_TRANSFER.md)
- [Automation synthesis (governed knowledge consumption)](./PLAYBOOK_AUTOMATION_SYNTHESIS_GOVERNED_KNOWLEDGE_CONSUMPTION.md), [Singleton consolidation pattern](./SINGLETON_CONSOLIDATION_PATTERN.md), [Triadic system pattern](./TRIAD_SYSTEM_PATTERN.md)

## Control plane, platform and business

- [Control plane / agent runtime v1](./CONTROL_PLANE_AND_AGENT_RUNTIME_V1.md), [Control plane architecture](./PLAYBOOK_CONTROL_PLANE_ARCHITECTURE.md), [Multi-repo control plane interfaces](./PLAYBOOK_MULTI_REPO_CONTROL_PLANE_INTERFACES.md), [Governed interface and API surfaces](./PLAYBOOK_GOVERNED_INTERFACE_API_SURFACES_FOR_MULTI_REPO_CONTROL_PLANES.md)
- [Platform architecture (long-term)](./PLAYBOOK_PLATFORM_ARCHITECTURE.md), [Workspace/tenant governance and optional hosted deployment](./PLAYBOOK_WORKSPACE_TENANT_GOVERNANCE_AND_OPTIONAL_HOSTED_DEPLOYMENT.md), [Packaging and SKU](./PLAYBOOK_PACKAGING_AND_SKU_ARCHITECTURE_OPEN_CORE_TO_TEAM_TO_ENTERPRISE.md)
- [Metrics, ROI and proof of value](./PLAYBOOK_METRICS_ROI_AND_PROOF_OF_VALUE_ARCHITECTURE.md), [Pilot, design-partner and rollout](./PLAYBOOK_PILOT_DESIGN_PARTNER_AND_ROLLOUT_ARCHITECTURE.md)
- [Lifeline wave 1 restart posture](./PLAYBOOK_LIFELINE_WAVE_1_RESTART_POSTURE.md), [Lifeline interop](./playbook-lifeline-interop.md)

## Models and overlays

- [Bloch-sphere state space](./BLOCH_SPHERE_STATE_SPACE.md), [Toroidal flow](./TOROIDAL_FLOW.md), [Simple rule theory](./SIMPLE_RULE_THEORY.md), [Evolutionary dynamics of knowledge graphs](./EVOLUTIONARY_DYNAMICS_OF_KNOWLEDGE_GRAPHS.md), [Second brain to Playbook evolution](./SECOND_BRAIN_TO_PLAYBOOK_EVOLUTION.md)
