import type { PlaybookConfig } from '../config/schema.js';
import type { PlaybookRule, StackDetector } from './pluginTypes.js';
import { getCoreRules } from '../rules/coreRules.js';
import { loadLegacyPredicatePlugins } from './legacyPredicateShim.js';
import { loadPlugins, type LoadedPlugins } from './loadPlugins.js';
import {
  getRegisteredDetectors,
  getRegisteredRules,
  registerDetector,
  registerRule,
  resetPluginRegistry
} from './pluginRegistry.js';

/**
 * The single engine path that turns "core + plugins" into the rule and detector
 * sets used by every command surface (engine verify/plan/analyze and the CLI
 * `verify`, `rules`, `apply`, `fix`, `status`, `analyze` commands). Callers must not
 * compose resetPluginRegistry/registerRule/loadPlugins themselves.
 *
 * Discovery follows docs/contracts/PLUGIN_CONTRACT_V1.md: `playbook.config.json`
 * `plugins` resolved from the repo root, plus the deprecated `playbook-plugin-*`
 * predicate shim.
 */

export type RuleSource = 'core' | 'plugin' | 'legacy-plugin';

export type RuleCatalogEntry = { rule: PlaybookRule; source: RuleSource };

export type RuleCatalog = {
  /** Deduplicated rules the engine executes (core first, then plugins). */
  rules: PlaybookRule[];
  /** Every discovered rule in explainability order: plugins, legacy plugins, then core. */
  entries: RuleCatalogEntry[];
  /** Non-fatal notes (deprecations, skipped plugins). Callers decide where to print them. */
  notices: string[];
};

const EMPTY_LOADED: LoadedPlugins = { configured: [], plugins: [], notices: [] };

export const loadRuleCatalog = (repoRoot: string, config: PlaybookConfig): RuleCatalog => {
  resetPluginRegistry();
  const core = getCoreRules(config);
  core.forEach(registerRule);
  const loaded = loadPlugins(repoRoot) ?? EMPTY_LOADED;
  const legacy = loadLegacyPredicatePlugins(repoRoot, loaded.configured);
  legacy.rules.forEach(registerRule);

  const pluginEntries: RuleCatalogEntry[] = loaded.plugins.flatMap((plugin) =>
    (plugin.rules ?? []).map((rule) => ({ rule, source: 'plugin' as const }))
  );
  const legacyEntries: RuleCatalogEntry[] = legacy.rules.map((rule) => ({ rule, source: 'legacy-plugin' as const }));
  const coreEntries: RuleCatalogEntry[] = core.map((rule) => ({ rule, source: 'core' as const }));

  return {
    rules: getRegisteredRules(),
    entries: [...pluginEntries, ...legacyEntries, ...coreEntries],
    notices: [...loaded.notices, ...legacy.notices]
  };
};

export const loadRuleRegistry = (repoRoot: string, config: PlaybookConfig): PlaybookRule[] =>
  loadRuleCatalog(repoRoot, config).rules;

export const loadDetectorRegistry = (repoRoot: string, coreDetectors: readonly StackDetector[]): StackDetector[] => {
  resetPluginRegistry();
  coreDetectors.forEach(registerDetector);
  loadPlugins(repoRoot);
  return getRegisteredDetectors();
};
