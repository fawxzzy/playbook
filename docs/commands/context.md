# `pnpm playbook context`

Print deterministic CLI and architecture context for tools and agents. It is the third step of the bootstrap ladder (`ai-context` -> `ai-contract` -> `context`) and gives broader repository and CLI context than the compact [`ai-context`](./ai-context.md) payload.

## Usage

- `pnpm playbook context`
- `pnpm playbook context --json`
- `pnpm playbook context --quiet` (suppresses text output; `--json` still prints)

## Behavior

- Read-only for repository sources; exits `0`. It takes no subcommands or command-specific flags.
- Reads `.playbook/module-digests.json` (produced by `pnpm playbook index`) and `.playbook/runtime-manifests.json` when present. Missing artifacts are reported as `moduleDigestsAvailable: false` / zero manifests, not as errors, so running `index` first gives a fuller result.
- The result is served through the context snapshot cache (`.playbook/context/cache-index.json` and `.playbook/context/snapshots/`), keyed on fingerprints of `.playbook/repo-index.json`, `.playbook/repo-graph.json`, `.playbook/module-digests.json` and `.playbook/runtime-manifests.json`, so the cache is reused only while those sources are unchanged.

## JSON contract

Fields (`schemaVersion` is `"1.0"`):

- `command`: `"context"`; `architecture`: `"modular-monolith"`; `workflow`: `["verify", "plan", "apply"]`.
- `repositoryIntelligence`: `artifact` (`.playbook/repo-index.json`), `moduleDigestsArtifact`, `moduleDigestsAvailable`, `moduleDigestCount`, and the intelligence `commands` (`index`, `query`, `ask`, `explain`).
- `controlPlaneArtifacts`: the canonical paths of the policy-evaluation, policy-apply-result, session, cycle-state, cycle-history, improvement-candidates and PR-review artifacts.
- `runtimeManifests`: `artifact`, `manifestsCount`, `manifests`.
- `cli.commands`: every registered CLI command name.
- `riskAwareContext`: risk-tier summary derived from module digests (`highRiskModules`, `lowRiskModules`, `defaultDepthByTier`), or `null` when no digests exist.

## Notes

- `architecture` and `workflow` are fixed descriptors of the Playbook model, not values inferred from the repository.
- Canonical ladder and command sequencing: [README.md](./README.md).

See also: [`ai-context.md`](./ai-context.md), [`ai-contract.md`](./ai-contract.md), [`index.md`](./index.md).
