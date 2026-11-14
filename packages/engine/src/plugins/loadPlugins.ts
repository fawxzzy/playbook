import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { registerPlugin } from './pluginRegistry.js';
import {
  PluginContractError,
  assertPluginSpecifier,
  isSupportedContractVersion,
  pickPluginExport,
  validatePluginShape
} from './pluginIdentity.js';
import { PLUGIN_CONTRACT_VERSION, type PlaybookPlugin } from './pluginTypes.js';

type PluginConfig = {
  plugins?: string[];
};

export type LoadedPlugins = {
  /** Plugin specifiers listed in `playbook.config.json` `plugins`, in order. */
  configured: string[];
  /** Plugins that were registered (contract-compatible). */
  plugins: PlaybookPlugin[];
  /** Human-readable, non-fatal notes (for example skipped incompatible plugins). */
  notices: string[];
};

export const loadPlugins = (repoRoot: string): LoadedPlugins => {
  const result: LoadedPlugins = { configured: [], plugins: [], notices: [] };
  const configPath = path.join(repoRoot, 'playbook.config.json');
  if (!fs.existsSync(configPath)) return result;

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as PluginConfig;
  const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
  if (!plugins.length) return result;
  result.configured = [...plugins];

  const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
  const seenSpecifiers = new Set<string>();
  const seenNames = new Set<string>();

  for (const entry of plugins) {
    // Identity first: nothing is resolved or executed for a specifier that fails the contract (fail closed).
    const pluginName = assertPluginSpecifier(repoRoot, entry);
    if (seenSpecifiers.has(pluginName)) {
      result.notices.push(`Plugin "${pluginName}" is listed more than once; the duplicate entry was ignored.`);
      continue;
    }
    seenSpecifiers.add(pluginName);

    const candidate = pickPluginExport(requireFromRepo(pluginName));
    if (!candidate) {
      result.notices.push(`Plugin "${pluginName}" does not export a plugin object (expected module.exports or default with a "name"). Plugin skipped.`);
      continue;
    }
    if (!isSupportedContractVersion(candidate.contractVersion)) {
      result.notices.push(
        `Plugin "${pluginName}" declares contractVersion ${String(candidate.contractVersion)}; this Playbook supports contractVersion ${PLUGIN_CONTRACT_VERSION}. Plugin skipped.`
      );
      continue;
    }
    const problems = validatePluginShape(candidate);
    if (problems.length > 0) {
      throw new PluginContractError(`Plugin "${pluginName}" violates Plugin Contract v${PLUGIN_CONTRACT_VERSION}: ${problems.join('; ')}.`);
    }
    const plugin = candidate as unknown as PlaybookPlugin;
    if (seenNames.has(plugin.name)) {
      result.notices.push(`Plugin "${pluginName}" reuses the name "${plugin.name}" of an earlier plugin. Plugin skipped.`);
      continue;
    }
    seenNames.add(plugin.name);
    registerPlugin(plugin);
    result.plugins.push(plugin);
  }

  return result;
};
