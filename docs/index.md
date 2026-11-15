# Playbook Documentation

Playbook is the deterministic repo runtime and trust layer between humans/AI agents and real repositories: deterministic intelligence, governance checks, and reviewed remediation loops.

Playbook is not a general-purpose chat assistant. It is a contract-first runtime for operating safely against production repositories.

## Canonical operating ladder

`ai-context -> ai-contract -> context -> index/query/explain/ask --repo-context -> verify -> plan -> apply -> verify`

## Start here (truth boundaries first)

- **Live command truth (operator source):** [Command status index](./commands/README.md)
- **Future intent and sequencing:** [Product roadmap](./PLAYBOOK_PRODUCT_ROADMAP.md)
- **Current architecture and runtime boundaries:** [Architecture](./ARCHITECTURE.md)
- **Machine-readable roadmap commitments:** [Roadmap contract (`ROADMAP.json`)](./roadmap/ROADMAP.json)
- **Unscheduled ideas:** [Improvements backlog](./roadmap/IMPROVEMENTS_BACKLOG.md)

## Who Playbook is for

- **AI coding agents:** keep Codex, Cursor and other agents inside repository architecture rules, documentation standards and governance contracts.
- **Large engineering teams:** keep architecture discipline across large repositories with deterministic, CI-friendly governance checks.
- **Open source projects:** prevent documentation drift and enforce repository standards as contributors and maintainers change.
- **Solo developers:** keep documentation and structure maintained automatically with lightweight, repeatable governance.

## Docs map

### Use Playbook

- [Repository README](../README.md) and [AI operating contract](../AGENTS.md)
- [FAQ](./FAQ.md), [Onboarding demo](./ONBOARDING_DEMO.md), [CLI examples](./EXAMPLES.md), [AI agent context](./AI_AGENT_CONTEXT.md)
- [Consumer integration contract](./CONSUMER_INTEGRATION_CONTRACT.md)
- [Patterns](./PATTERNS.md), [Playbook checklist](./PLAYBOOK_CHECKLIST.md), [Playbook notes](./PLAYBOOK_NOTES.md)

### Reference

- [Command docs](./commands/README.md): one page per command, live status and truth
- [CLI reference](./REFERENCE/cli.md), [Config reference](./REFERENCE/config.md), [Exit codes](./REFERENCE/exit-codes.md), [Verify rules](./REFERENCE/verify-rules.md)
- [Contracts](./contracts/README.md): schemas and artifact contracts, including [command-truth.json](./contracts/command-truth.json)
- [Concepts](./concepts/what-is-playbook.md): [governance model](./concepts/governance-model.md), [policy model](./concepts/policy-model.md), [knowledge pipeline](./concepts/knowledge-pipeline.md), [plugins and adapters](./concepts/plugins-and-adapters.md), [conversation graphs](./concepts/conversation-graphs.md), [docs merge](./concepts/docs-merge.md)

### Architecture

- [Architecture](./ARCHITECTURE.md) and [architecture index](./architecture/README.md) (specs, memory, control plane, learning)
- [Generated architecture diagrams](./ARCHITECTURE_DIAGRAMS.md) and the [diagram generation how-to](./DIAGRAMS.md)
- [Decisions](./decisions/0001-package-manager-pnpm.md), [Doctrine registry](./doctrine/README.md), [Repo truth pack standard](./repo-truth-pack.md)
- [Security principles](./SECURITY_PRINCIPLES.md) and [security baseline](./security/SECURITY_BASELINE.md)

### Plan and operate

- [Product roadmap](./PLAYBOOK_PRODUCT_ROADMAP.md), [roadmap folder](./roadmap/README.md), [business strategy](./PLAYBOOK_BUSINESS_STRATEGY.md), [automation synthesis vision](./AUTOMATION_SYNTHESIS_VISION.md)
- [Development workflow](./PLAYBOOK_DEV_WORKFLOW.md), [project governance](./PROJECT_GOVERNANCE.md), [contributing](./contributing.md), [testing](./TESTING.md)
- [Releasing](./RELEASING.md), [changelog](./CHANGELOG.md), [changelog generator](./CHANGELOG-GENERATOR.md), [GitHub setup](./GITHUB_SETUP.md)
- [UI guidelines](./UI_GUIDELINES.md), [ATLAS migration matrices](./migration/ATLAS_TO_PLAYBOOK_MIGRATION_MATRIX_2026-05-03.md), [demo companion changes](./integration/PLAYBOOK_DEMO_COMPANION_CHANGES.md)

## Research highlights

### Cognitive Dynamics Framework v0.1

Short summary: a doctrine-level model for how repository signals become compressed, stabilized, and recalibrated under governance without replacing deterministic command truth.

- Framework spec: [Cognitive Dynamics Framework v0.1](./research/COGNITIVE_DYNAMICS_FRAMEWORK_V0_1.md)
- Other research notes: [Attractor model of meaning](./research/ATTRACTOR_MODEL_OF_MEANING.md), [Theory of pattern meaning](./research/THEORY_OF_PATTERN_MEANING.md), [research compendium](./learning/research-compendium.md)
- Parked theory notes (not product contracts): [theory index](./research/theory/README.md)

## Historical/transitional docs

- Archived docs index: [docs/archive/README.md](./archive/README.md)
- Archived roadmap snapshots: [docs/archive/roadmap/](./archive/roadmap/)

Rule: canonical operator truth should live in one clearly identified surface, not overlapping docs.
