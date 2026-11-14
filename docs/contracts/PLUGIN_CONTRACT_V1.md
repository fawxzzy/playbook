# Plugin Contract v1

This document is the contract for Playbook plugins. One engine path loads them for every command surface
(`verify`, `plan`, `apply`, `fix`, `status`, `rules`, `analyze`, `index`); the CLI does not discover plugins itself.

Implementation: `packages/engine/src/plugins/` (`loadPlugins.ts`, `pluginTypes.ts`,
`pluginIdentity.ts`, `unifiedPluginRegistry.ts`, `legacyPredicateShim.ts`). Manifest schema: `packages/contracts/src/plugin-manifest.schema.json` (registered as `plugin-manifest` in `playbook contracts`). Verified by `packages/engine/test/pluginIdentityV1.test.ts`, `packages/engine/test/plugins.test.ts`,
`packages/engine/test/pluginLoadingPath.test.ts`, `packages/engine/test/pluginContractV1.test.ts` and
`packages/cli/src/lib/pluginContract.test.ts`.

## Discovery

1. A repository lists plugins in `playbook.config.json`:

   ```json
   { "version": 1, "plugins": ["my-playbook-plugin"] }
   ```

2. Each entry must be a **plugin specifier** (see Identity below). It is resolved with Node module resolution from the
   repository root (as if from `<repo>/package.json`) and `require`d. The module exports a `PlaybookPlugin` (or
   `{ default: PlaybookPlugin }`).
3. A listed plugin that cannot be resolved, throws while loading, has a specifier or shape that violates this contract
   (`PluginContractError`) fails engine `verify`, `plan` and `analyze`.
   The CLI `rules`, `apply`, `fix` and `status` commands degrade to built-in rules and report the reason on
   stderr; `index` degrades to the core rule ids silently.
4. Plugins are loaded in listed order. A rule or detector whose `id` is already registered is ignored (core rules
   are registered first, so a plugin cannot replace a core rule).
5. Deprecated: dependencies named `playbook-plugin-*` that are not listed in `plugins` are still discovered by the
   compatibility shim below.

## Identity and least privilege

Identity is checked before anything is resolved or executed (`assertPluginSpecifier`, fail closed):

- A specifier is a bare package name (`name`, `@scope/name`, optional `/sub/path`) or a repo-local `./` file whose real path
  (after resolving links and junctions) stays inside the repository root.
- Rejected with `PluginContractError`: absolute and drive paths, backslashes, `..` or empty path segments, URL and
  `node:`/`file:` schemes, Node built-ins, control characters, padded or non-string entries.
- A plugin must export a non-empty string `name`. A module with no plugin object is skipped with a notice; a plugin whose
  rules or detectors are not executable (`check`/`detect` not functions, missing `id`) is rejected with an error naming
  the offending member.
- A specifier listed twice, or a second plugin that reuses an earlier plugin's `name`, is ignored with a notice; the first
  wins. A plugin can never replace a core rule or an earlier plugin's rule or detector id.
- Unsupported `contractVersion` (any value other than `1` or absent, of any JSON type) is skipped with a notice and none of
  its rules or detectors is registered.
- The shim only follows dependency names that are valid package names, so a `package.json` dependency cannot point it
  outside `node_modules`.
- Privilege is unchanged and never raised by a plugin: plugin rules are report-only (`check` returns failures); a plugin
  `fix` handler is floored at change level 2 and stays under the apply ceiling (Level 3 needs the recorded override).
  Loading a plugin is arbitrary code execution by design, so the trust boundary is the repository's own
  `playbook.config.json` and dependency graph; this contract narrows what a config entry can reach, it is not a sandbox.

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

The v1 specifier and shape rules above were tightened inside `contractVersion` 1 (fail-closed hardening, PB-V05-PACKAGE-BOUNDARIES-001
hardening), and that is a behavior change for existing plugins, not a no-op: an absolute-path, drive-path, backslash,
traversal or URL specifier, an escaping link, a plugin without a non-empty `name`, a rule without a string `description`, a
detector without a string `label`, and a rule or detector without a non-empty `id` or executable `check`/`detect` now fail
with a named `PluginContractError` (previously they loaded or failed later), and a duplicate listing or a second plugin that
reuses a name is now skipped with a notice. Plugins that follow the rules above load unchanged. From here on, specifier or
shape rules may only be tightened by a new `contractVersion`. Changing `PlaybookPlugin`, `PlaybookRule`, discovery rules or `contractVersion` handling requires a new
`contractVersion`, an update to this document and the plugin tests above. Changing `rules --json` output follows
`docs/contracts/COMMAND_CONTRACTS_V1.md`.
