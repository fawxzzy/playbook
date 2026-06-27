# `pnpm playbook contracts`

Emit a deterministic contracts registry for artifact/document/schema surfaces.

## Usage

```bash
pnpm playbook contracts
pnpm playbook contracts --json
pnpm playbook contracts --out .playbook/contracts-registry.json
pnpm playbook contracts --json --out .playbook/contracts-registry.json
```

## Flags

- `--json`: print machine-readable registry JSON to stdout.
- `--out <path>`: write registry JSON to a file.

## Write behavior

- Default output path is `.playbook/contracts-registry.json` when writing.
- `--json` only: prints JSON and does not write by default.
- `--out <path>` only: writes artifact and prints text confirmation.
- `--json --out <path>`: prints JSON and writes artifact.

## Output shape

Registry output includes:

- base contracts registry payload from engine
- `schemas.memoryArtifacts` registrations
- `schemas.commandOutputs` registrations for additive command-output contracts

The reusable workflow-pack discovery surface is also exposed here. In particular, the registry now carries:

- local verification receipt runtime defaults
- local verification receipt schema registration
- workflow promotion schema registrations
- selected owner docs for workflow-pack reuse, versioning, consumer integration boundaries, and the core Playbook continuity contract
- machine-readable contract roles when a downstream consumer must discover a specific owner contract semantically rather than by path convention alone
- a compact `artifacts.contractRoles` lookup for direct role-to-path resolution of semantically important owner contracts, including a paired canonical `exportPath` when a role also has one machine export

The current role-tagged contract is:

- `docs/contracts/PLAYBOOK-CONTRACT.md` with `role: "core_continuity_doctrine"`
- paired export: `exports/playbook.contract.example.v1.json`

Use `pnpm playbook schema contracts --json` to validate output shape.

## Replay / consolidation contracts

The registry now includes explicit temporal-memory substrate contracts for:

- `.playbook/memory/replay-candidates.json`
- `.playbook/memory/consolidation-candidates.json`
- `.playbook/memory/replay-candidates.json#replayEvidence`

These artifacts stay candidate-only, preserve provenance end-to-end, and do not imply promotion.
