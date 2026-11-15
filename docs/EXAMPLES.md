# Playbook CLI Examples

## Analyze a repository

```bash
pnpm playbook analyze
```

## Verify repository governance

```bash
pnpm playbook verify
```

## Initialize Playbook

```bash
pnpm playbook init
```

## Sample CLI output

```text
$ pnpm playbook analyze
Detected Stack

Framework: Next.js
Database: Supabase
Styling: Tailwind

$ pnpm playbook verify
PASS  requireNotesOnChanges
All governance checks passed.
```

## Build the semantic architecture graph

```bash
pnpm playbook index
pnpm playbook graph build
```

Writes `.playbook/arch-graph.v2.json`. See [Architecture intelligence graph contract](contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md).

## Classify failures

```bash
pnpm playbook failure ingest --input <failure-records.json>
pnpm playbook failure suggest
```

Writes `.playbook/failure-taxonomy.json` and prints prevention suggestions. See [Failure intelligence contract](contracts/FAILURE_INTELLIGENCE_CONTRACT.md).

## Apply a plan with a Level 3 override

```bash
pnpm playbook plan
pnpm playbook apply --from-plan .playbook/plan.json --allow-level 3 --reason "update CI workflow permissions"
```

Only needed when the plan touches security-sensitive paths. See [Plan/apply override contract](contracts/PLAN_APPLY_OVERRIDE_CONTRACT.md).

## Load a plugin

```json
{ "version": 1, "plugins": ["my-playbook-plugin"] }
```

Put this in `playbook.config.json`. See [Plugin contract v1](contracts/PLUGIN_CONTRACT_V1.md).
