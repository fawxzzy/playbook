import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { PlaybookRule, PluginRuleFailureRef } from './pluginTypes.js';

/**
 * Compatibility shim for pre-contract plugins discovered as `playbook-plugin-*`
 * dependencies whose rules use the predicate shape
 * `verify({ failure }) -> boolean`. Those rules never produced failures; they only
 * explained failures reported by other rules, so the adapted rule executes nothing
 * and carries the predicate as `matchesFailure`.
 *
 * Deprecated by docs/contracts/PLUGIN_CONTRACT_V1.md. This is the only module that
 * knows the legacy shape or the `playbook-plugin-*` discovery convention.
 */

type LegacyRule = {
  id: unknown;
  description: unknown;
  verify: unknown;
  policy?: PlaybookRule['policy'];
  fix?: PlaybookRule['fix'];
  explanation?: string;
  remediation?: string[];
};

type LegacyModule = { rules?: LegacyRule[] };

export type LegacyShimResult = {
  rules: PlaybookRule[];
  notices: string[];
};

const LEGACY_PLUGIN_NAME = /^playbook-plugin-/;

const readLegacyPluginNames = (repoRoot: string): string[] => {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  const names = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {})
  ];

  return [...new Set(names)].filter((name) => LEGACY_PLUGIN_NAME.test(name));
};

const adaptLegacyRule = (rule: LegacyRule): PlaybookRule | undefined => {
  if (!rule || typeof rule.id !== 'string' || typeof rule.description !== 'string' || typeof rule.verify !== 'function') {
    return undefined;
  }
  const predicate = rule.verify as (ctx: { failure: PluginRuleFailureRef }) => boolean;

  return {
    id: rule.id,
    description: rule.description,
    check: () => ({ failures: [] }),
    matchesFailure: (failure) => predicate({ failure }),
    policy: rule.policy,
    fix: rule.fix,
    explanation: rule.explanation,
    remediation: rule.remediation
  };
};

/**
 * @param configuredPlugins plugin specifiers already loaded through the contract path;
 * a package listed there is never loaded a second time through the shim.
 */
export const loadLegacyPredicatePlugins = (repoRoot: string, configuredPlugins: readonly string[] = []): LegacyShimResult => {
  const result: LegacyShimResult = { rules: [], notices: [] };
  const configured = new Set(configuredPlugins);
  const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));

  for (const dependencyName of readLegacyPluginNames(repoRoot)) {
    if (configured.has(dependencyName)) continue;
    const entryPath = path.join(repoRoot, 'node_modules', dependencyName, 'index.js');
    if (!fs.existsSync(entryPath)) continue;

    try {
      const loaded = requireFromRepo(entryPath) as LegacyModule & { default?: LegacyModule };
      const pluginModule = loaded.rules ? loaded : loaded.default;
      const rules = Array.isArray(pluginModule?.rules) ? pluginModule.rules : [];
      const adapted = rules.flatMap((rule) => {
        const mapped = adaptLegacyRule(rule);
        return mapped ? [mapped] : [];
      });
      if (adapted.length > 0) {
        result.rules.push(...adapted);
        result.notices.push(
          `Plugin "${dependencyName}" uses the deprecated predicate rule shape (verify({ failure }) -> boolean) discovered through the playbook-plugin-* naming convention. ` +
            'List it in playbook.config.json "plugins" and migrate its rules to Plugin Contract v1 (check(ctx) -> { failures }); see docs/contracts/PLUGIN_CONTRACT_V1.md.'
        );
      }
    } catch {
      // Broken legacy plugin modules were always skipped; keep that behavior.
    }
  }

  return result;
};
