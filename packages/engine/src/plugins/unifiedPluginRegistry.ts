import type { PlaybookConfig } from '../config/schema.js';
import type { PlaybookRule, StackDetector } from './pluginTypes.js';
import { getCoreRules } from '../rules/coreRules.js';
import { loadPlugins } from './loadPlugins.js';
import {
  getRegisteredDetectors,
  getRegisteredRules,
  registerDetector,
  registerRule,
  resetPluginRegistry
} from './pluginRegistry.js';

/**
 * The single engine path that turns "core + configured plugins" into the rule
 * and detector sets used by engine command surfaces (verify, plan/execution,
 * analyze). Callers must not compose resetPluginRegistry/registerRule/
 * loadPlugins themselves.
 *
 * Scope: `playbook.config.json` `plugins` resolved from the repo root through
 * `loadPlugins`. The CLI-side explainability loader (`loadVerifyRules`) uses a
 * different discovery and rule shape and is tracked as an open item in
 * docs/architecture/V1_BOUNDARY_REFACTOR_PLAN.md.
 */
export const loadRuleRegistry = (repoRoot: string, config: PlaybookConfig): PlaybookRule[] => {
  resetPluginRegistry();
  getCoreRules(config).forEach(registerRule);
  loadPlugins(repoRoot);
  return getRegisteredRules();
};

export const loadDetectorRegistry = (repoRoot: string, coreDetectors: readonly StackDetector[]): StackDetector[] => {
  resetPluginRegistry();
  coreDetectors.forEach(registerDetector);
  loadPlugins(repoRoot);
  return getRegisteredDetectors();
};
