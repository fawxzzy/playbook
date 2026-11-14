# `pnpm playbook index`

Generate deterministic repository intelligence and write it to `.playbook/repo-index.json`.

## Usage

- `pnpm playbook index`
- `pnpm playbook index --json`
- `pnpm playbook index --json --out <path>`

## Behavior

`pnpm playbook index` performs lightweight heuristic detection for:

- framework
- language
- architecture
- top-level `src` modules
- dependency graph edges (workspace manifests, root manifest, and source imports)
- workspace topology for `packages/*` relationships
- module test presence mapping
- config surface (eslint, tsconfig, jest, vitest, command inventory)
- database technology
- loaded Playbook rule ids

The command always overwrites `.playbook/repo-index.json` with the latest deterministic index payload. In the same run it also writes:

- `.playbook/repo-graph.json` (consumed by `pnpm playbook graph`)
- `.playbook/module-digests.json` and per-module context digests under `.playbook/context/modules/`
- compaction candidate artifacts under `.playbook/compaction/`
- `.playbook/system-map.json`, only when `.playbook/architecture/subsystems.json` exists

`--out <path>` additionally writes the `--json` payload to `<path>` wrapped in an artifact envelope (`artifact`, `version`, `generated_at`, `checksum`, `data`). The command exits `0` on success.

## JSON contract

`pnpm playbook index --json` prints a summary of what was written:

```json
{
  "command": "index",
  "ok": true,
  "indexFile": ".playbook/repo-index.json",
  "graphFile": ".playbook/repo-graph.json",
  "moduleDigestFile": ".playbook/module-digests.json",
  "systemMapFile": ".playbook/system-map.json",
  "contextDir": ".playbook/context/modules",
  "framework": "...",
  "architecture": "...",
  "modules": ["..."]
}
```

The index itself, `.playbook/repo-index.json`, has this shape:

```json
{
  "schemaVersion": "1.0",
  "framework": "...",
  "language": "...",
  "architecture": "...",
  "modules": [{ "name": "...", "dependencies": ["..."] }],
  "dependencies": [{ "from": "...", "to": "...", "type": "workspace-manifest | source-import | root-manifest" }],
  "workspace": [{ "name": "...", "path": "...", "role": "...", "dependsOn": [] }],
  "tests": [{ "module": "...", "tests_present": true, "coverage_estimate": "unknown" }],
  "configs": [{ "name": "tsconfig", "path": "tsconfig.json", "present": true }],
  "database": "...",
  "rules": ["..."],
  "architectureRoleInference": { "classificationMode": "observation-only" }
}
```

