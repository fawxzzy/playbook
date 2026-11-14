# `pnpm playbook explain`

Explain deterministic intelligence targets from repository artifacts and the rule registry.

## Usage

- `pnpm playbook explain PB001`
- `pnpm playbook explain workouts`
- `pnpm playbook explain architecture`
- `pnpm playbook explain workouts --json`
- `pnpm playbook explain workouts --with-memory --json`
- `pnpm playbook explain subsystem <name>`
- `pnpm playbook explain artifact <path>`
- `pnpm playbook explain command <name>`

## Supported targets

- Verify/analyze rule IDs (for example `PB001`)
- Indexed module names (for example `workouts`)
- `architecture`
- `subsystem <name>`, `artifact <path>`, and `command <name>`: introspect the architecture registry at `.playbook/architecture/subsystems.json` (a missing registry or an unknown name is a deterministic error, exit `1`). In JSON these add `subsystem_dependencies`, `artifact_lineage` (plus `cycle_state`, `cycle_history`, `policy_evaluation`, `policy_apply_result`, `session_evidence_envelope` or `pr_review` when the path is one of those artifacts), or `command_inspection` to `explanation`.

## Implemented behavior

- Missing `<target>` returns a deterministic CLI error (exit `1`).
- Unknown targets return an `unknown` explanation type and a non-zero exit code (`1`).
- Module explanations also carry `riskAwareShaping` when a module digest exists (`.playbook/module-digests.json`, written by `pnpm playbook index`).
- `--with-memory` adds deterministic memory descriptors without changing default output.

Memory-aware responses may include:

- `memorySummary`
- `memorySources`
- `knowledgeHits`
- `doctrineHits` (promoted governed doctrine records with provenance; empty when no registry is committed)
- `recentRelevantEvents`
- `memoryKnowledge` (promoted knowledge + replay candidates with provenance)

## JSON contract

```json
{
  "command": "explain",
  "target": "workouts",
  "type": "module",
  "explanation": {
    "resolvedTarget": {
      "input": "workouts",
      "kind": "module",
      "selector": "workouts",
      "canonical": "module:workouts",
      "matched": true
    },
    "name": "workouts",
    "responsibilities": [
      "Owns workouts feature behavior and boundaries.",
      "Encapsulates workouts domain logic and module-level policies."
    ],
    "dependencies": [],
    "architecture": "modular-monolith",
    "graphNeighborhood": {
      "node": { "id": "module:workouts", "kind": "module", "name": "workouts" },
      "outgoing": [{ "kind": "governed_by", "target": "rule:requireNotesOnChanges" }],
      "incoming": [{ "kind": "contains", "source": "repository:root" }]
    }
  }
}
```
