# Plugin Contract v1

This document is the contract for Playbook plugins. One engine path loads them for every command surface
(`verify`, `plan`, `apply`, `fix`, `status`, `rules`, `analyze`, `index`); the CLI does not discover plugins itself.

Implementation: `packages/engine/src/plugins/` (`loadPlugins.ts`, `pluginTypes.ts`,
`unifiedPluginRegistry.ts`, `legacyPredicateShim.ts`). Verified by `packages/engine/test/plugins.test.ts`,
`packages/engine/test/pluginLoadingPath.test.ts`, `packages/engine/test/pluginContractV1.test.ts` and
`packages/cli/src/lib/pluginContract.test.ts`.

## Discovery

1. A repository lists plugins in `playbook.config.json`:

   ```json
   { "version": 1, "plugins": ["my-playbook-plugin"] }
   ```

2. Each entry is resolved with Node module resolution from the repository root (as if from `<repo>/package.json`)
   and `require`d. The module exports a `PlaybookPlugin` (or `{ default: PlaybookPlugin }`).
3. A listed plugin that cannot be resolved or throws while loading fails engine `verify`, `plan` and `analyze`.
   The CLI `rules`, `apply`, `fix` and `status` commands degrade to built-in rules and report the reason on
   stderr; `index` degrades to the core rule ids silently.
4. Plugins are loaded in listed order. A rule or detector whose `id` is already registered is ignored (core rules
   are registered first, so a plugin cannot replace a core rule).
5. Deprecated: dependencies named `playbook-plugin-*` that are not listed in `plugins` are still discovered by the
   compatibility shim below.

## Plugin shape

```ts
interface PlaybookPlugin {
  name: string;
  contractVersion?: 1;          // absent means 1
  rules?: PlaybookRule[];
  detectors?: StackDetector[];
}
```

- `contractVersion`: the contract version the plugin was written against. Absent is treated as `1`. Any other value
  causes the plugin to be skipped with a notice (never a crash), so a future v2 plugin cannot be half-loaded by an
  older Playbook.

### Rules

```ts
interface PlaybookRule {
  id: string;
  description: string;
  check(ctx: { repoRoot: string; changedFiles: string[]; baseRef?: string; baseSha?: string }):
    { failures: Array<{ id: string; message: string; evidence?: string; fix?: string }> };

  // Optional explainability, policy and remediation (used by verify/rules/apply/fix/status):
  explanation?: string;
  remediation?: string[];
  policy?: { id: string; description?: string };
  fix?: FixHandler;
  matchesFailure?(failure: { id: string; message: string; evidence?: string; fix?: string }): boolean;
}
```

- `check` runs during engine `verify` and `plan` and returns the failures the rule found.
- `matchesFailure` decides which reported failures this rule explains and fixes. Default: `failure.id === rule.id`.
- `fix` is a plugin fix handler. Plugin handlers are always treated as change level 2 by `apply`
  (see `docs/commands/apply.md`).

### Detectors

```ts
interface StackDetector {
  id: string;
  label: string;
  detect(repo: { repoRoot: string; packageJsonPath: string; dependencies: Record<string, string>; devDependencies: Record<string, string> }):
    { confidence: number; evidence: string[] } | null;
}
```

Plugin detectors run after the core detectors in `analyze` (both the CLI command and the engine `analyzeRepo`).
In the CLI the core detectors stay dependency-only; plugin detectors are added to `detected` and `detectorsRun`.

## Surfaces

| Surface | What it uses |
| --- | --- |
| `verify`, `plan` (engine) | executes `check` of core and plugin rules |
| CLI `verify`, `apply`, `fix`, `status` | `matchesFailure`, `policy`, `explanation`, `remediation`, `fix` of plugin rules, then the CLI built-in guidance |
| `rules --json` | lists every rule with an additive `source` field |
| `analyze` | plugin detectors |
| `index` (`.playbook/repo-index.json`) | `rules` includes plugin rule ids (sorted, de-duplicated) |

### `rules --json` (additive changes)

`verify[]` entries keep `id`, `description` and (with `--explain`) `explanation`, and gain:

- `source`: `"core"`, `"plugin"` or `"legacy-plugin"`.

`verify[]` now also lists engine core rules that have no CLI guidance entry (for example
`requireNotesFileWhenGovernanceExists`) and plugin rules. `analyze[]` is unchanged.

## Deprecated: legacy predicate plugins (shim)

Before this contract, the CLI discovered `playbook-plugin-*` dependencies and read
`node_modules/<name>/index.js` rules shaped `{ id, description, verify({ failure }) -> boolean, ... }`. Those
rules never produced failures; they only explained failures from other rules. The shim keeps that behavior:

- discovery: dependency names matching `playbook-plugin-*` in `package.json` that are not listed in `plugins`;
- adaptation: the rule becomes `{ check: () => ({ failures: [] }), matchesFailure: verify, ... }`, `source` is
  `"legacy-plugin"`;
- notice: one deprecation notice per plugin per process, written to stderr only (never into `--json` stdout);
- broken legacy modules and rules without a `verify` function are skipped silently, as before;
- a package that is also listed in `plugins` is loaded through the contract path only.

Migration: list the package in `playbook.config.json` `plugins`, rename `verify` to `matchesFailure`, and add a
`check` that returns the failures (or `{ failures: [] }` for explanation-only rules).

Known differences from the removed CLI loader: it used dynamic `import()` and the shim uses `require` (an ESM-only
legacy plugin loads only where `require(esm)` is supported, Node 22.12 or newer; otherwise it is skipped as a
broken module), and a legacy rule whose id equals a core engine rule id no longer overrides the CLI guidance for
that id.

## Change policy

Changing `PlaybookPlugin`, `PlaybookRule`, discovery rules or `contractVersion` handling requires a new
`contractVersion`, an update to this document and the plugin tests above. Changing `rules --json` output follows
`docs/contracts/COMMAND_CONTRACTS_V1.md`.
